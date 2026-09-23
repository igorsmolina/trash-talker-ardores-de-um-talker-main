"""
routes/chats_api.py
====================
Endpoints protegidos por login: dados do dashboard (usuário + lista de
conversas), leitura/criação/renomeação/exclusão de conversas e
atualização do perfil da conta.

Equivalente a:
  - src/routes/pages.ts (as partes que buscavam `chats` e `messages` no
    banco para montar as páginas - aqui essa busca é exposta como JSON)
  - src/routes/chats.ts (criar/renomear/excluir chat, atualizar perfil)

Todas as rotas abaixo passam pelo decorator @require_auth, então
`g.user` sempre está preenchido dentro delas (equivalente ao
`req.user` do AuthedRequest em TypeScript).
"""

import traceback
from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from backend.ai import DEFAULT_EFFORT, EFFORTS, EFFORTS_PUBLIC, generate_reply
from backend.auth import (
    SESSION_COOKIE_NAME,
    clear_session_cookie,
    destroy_all_sessions,
    get_password_requirement_failures,
    hash_password,
    require_auth,
    verify_password,
)
from backend.avatars import ILLUSTRATED_AVATARS
from backend.db import execute, get_owned_chat, new_id, query, query_one
from backend.personalities import (
    DEFAULT_PERSONALITY,
    LAZY_HANDOFF_TO,
    PERSONALITIES,
    PERSONALITIES_PUBLIC,
    get_handoff_line,
    should_hand_off,
)

chats_api = Blueprint("chats_api", __name__, url_prefix="/api")

@chats_api.route("/dashboard", methods=["GET"])
@require_auth
def dashboard():
    """
    Dados usados em TODA página do dashboard: usuário logado + lista de
    conversas (para montar a sidebar). Chamado por frontend/js/layout.js
    em toda página dashboard*.html.
    """
    chats = query(
        "SELECT * FROM chats WHERE user_id = %s ORDER BY updated_at DESC",
        (g.user["id"],),
    )
    # created_at não vem de get_session_user() (que devolve só os campos
    # mínimos usados em toda rota autenticada) - buscado à parte porque só
    # a página de Configurações usa esse campo hoje.
    account = query_one(
        "SELECT created_at FROM users WHERE id = %s", (g.user["id"],)
    )
    user = {**g.user, "created_at": account["created_at"] if account else None}
    return jsonify(
        {
            "user": user,
            "chats": chats,
            "illustratedAvatars": ILLUSTRATED_AVATARS,
            "personalities": PERSONALITIES_PUBLIC,
            "efforts": EFFORTS_PUBLIC,
        }
    )


@chats_api.route("/chats/<chat_id>", methods=["GET"])
@require_auth
def get_chat(chat_id):
    """Dados de uma conversa específica + suas mensagens (frontend/js/chat.js)."""
    chat = get_owned_chat(chat_id, g.user["id"])
    if not chat:
        return jsonify({"error": "Conversa não encontrada"}), 404

    messages = query(
        "SELECT * FROM messages WHERE chat_id = %s ORDER BY created_at ASC",
        (chat["id"],),
    )
    return jsonify({"chat": chat, "messages": messages})


@chats_api.route("/chats", methods=["POST"])
@require_auth
def create_chat():
    """Cria uma nova conversa vazia e devolve o id (o frontend navega até ela)."""
    body = request.get_json(silent=True) or {}
    personality = body.get("personality")
    if personality not in PERSONALITIES:
        # Ausente/inválido: cai no padrão em vez de rejeitar a criação da
        # conversa - é um campo opcional, não deve travar a ação principal.
        personality = DEFAULT_PERSONALITY

    effort = body.get("effort")
    if effort not in EFFORTS:
        effort = DEFAULT_EFFORT

    chat_id = new_id()
    execute(
        "INSERT INTO chats (id, user_id, title, personality, effort) "
        "VALUES (%s, %s, %s, %s, %s)",
        (chat_id, g.user["id"], "New Chat", personality, effort),
    )
    return jsonify({"id": chat_id}), 201


@chats_api.route("/chats/<chat_id>/messages", methods=["POST"])
@require_auth
def send_message(chat_id):
    """
    Completa o "Stage 3": salva a mensagem do usuário, chama a IA
    (Gemini) com o histórico da conversa e salva/devolve a resposta.
    """
    chat = get_owned_chat(chat_id, g.user["id"])
    if not chat:
        return jsonify({"error": "Conversa não encontrada"}), 404

    body = request.get_json(silent=True) or {}
    content = (body.get("content") or "").strip()
    if not content:
        return jsonify({"error": "Mensagem vazia"}), 400

    user_message_id = new_id()
    execute(
        "INSERT INTO messages (id, chat_id, role, content) VALUES (%s, %s, %s, %s)",
        (user_message_id, chat_id, "user", content),
    )
    execute("UPDATE chats SET updated_at = now() WHERE id = %s", (chat_id,))

    history = query(
        "SELECT role, content FROM messages WHERE chat_id = %s ORDER BY created_at ASC",
        (chat_id,),
    )

    # Primeira mensagem da conversa: usa ela como título automático em
    # vez de deixar "New Chat" até o usuário renomear na mão.
    if len(history) == 1:
        title = content[:40] + ("…" if len(content) > 40 else "")
        execute("UPDATE chats SET title = %s WHERE id = %s", (title, chat_id))

    # Preguiça do MathIAs (ver personalities.py): num textão ele entrega os
    # pontos e a conversa passa pro TrashTalker. Decidido aqui, mas só
    # GRAVADO depois que a IA responder - se a chamada falhar (502 abaixo),
    # a conversa fica exatamente como estava e dá pra tentar de novo.
    personality = chat["personality"]
    handoff_line = None
    if should_hand_off(personality, content):
        handoff_line = get_handoff_line()
        personality = LAZY_HANDOFF_TO

    try:
        reply_text = generate_reply(history, g.user, personality, chat["effort"])
    except Exception:
        # Log temporário pra debugar a migração Groq -> Gemini. Remover
        # (ou trocar por logging de verdade) depois que estabilizar.
        traceback.print_exc()
        return jsonify(
            {"error": "Não foi possível falar com a IA agora. Tente de novo."}
        ), 502

    # A pessoa pode ter apertado "parar" enquanto a IA pensava. A chamada ao
    # Gemini é bloqueante e não dá pra abortar do lado do servidor, então o
    # combinado é outro: POST /chats/<id>/cancel apaga a mensagem do usuário,
    # e aqui a gente confere se ela ainda existe antes de gravar qualquer
    # coisa. Sem isso a resposta seria salva assim mesmo e apareceria sozinha
    # na conversa no próximo carregamento.
    if not query_one("SELECT id FROM messages WHERE id = %s", (user_message_id,)):
        return jsonify({"cancelled": True})

    # Gravada ANTES da resposta pra ficar na ordem certa no histórico
    # (created_at): textão -> "tô com preguiça" -> resposta do TrashTalker.
    handoff_message = None
    if handoff_line:
        execute(
            "UPDATE chats SET personality = %s, updated_at = now() WHERE id = %s",
            (personality, chat_id),
        )
        handoff_message_id = new_id()
        execute(
            "INSERT INTO messages (id, chat_id, role, content) VALUES (%s, %s, %s, %s)",
            (handoff_message_id, chat_id, "assistant", handoff_line),
        )
        handoff_message = query_one(
            "SELECT * FROM messages WHERE id = %s", (handoff_message_id,)
        )

    assistant_message_id = new_id()
    execute(
        "INSERT INTO messages (id, chat_id, role, content) VALUES (%s, %s, %s, %s)",
        (assistant_message_id, chat_id, "assistant", reply_text),
    )
    execute("UPDATE chats SET updated_at = now() WHERE id = %s", (chat_id,))

    user_message = query_one("SELECT * FROM messages WHERE id = %s", (user_message_id,))
    assistant_message = query_one(
        "SELECT * FROM messages WHERE id = %s", (assistant_message_id,)
    )
    chat = query_one("SELECT * FROM chats WHERE id = %s", (chat_id,))
    return jsonify(
        {
            "chat": chat,
            "userMessage": user_message,
            # None quando não houve troca - o frontend só desenha a bolha
            # extra e sincroniza o seletor quando este campo vem preenchido.
            "handoffMessage": handoff_message,
            "assistantMessage": assistant_message,
        }
    )


@chats_api.route("/chats/<chat_id>/delete", methods=["POST"])
@require_auth
def delete_chat(chat_id):
    execute(
        "DELETE FROM chats WHERE id = %s AND user_id = %s",
        (chat_id, g.user["id"]),
    )
    return jsonify({"ok": True})


@chats_api.route("/chats/<chat_id>/title", methods=["POST"])
@require_auth
def rename_chat(chat_id):
    body = request.get_json(silent=True) or {}
    title = (body.get("title") or "").strip()
    if len(title) < 1:
        return jsonify({"error": "Título inválido"}), 400

    execute(
        "UPDATE chats SET title = %s, updated_at = now() "
        "WHERE id = %s AND user_id = %s",
        (title, chat_id, g.user["id"]),
    )
    return jsonify({"ok": True})


@chats_api.route("/chats/<chat_id>/cancel", methods=["POST"])
@require_auth
def cancel_message(chat_id):
    """
    Chamado quando a pessoa aperta "parar" enquanto a IA está pensando.

    Não dá pra abortar a chamada ao Gemini: ela é bloqueante e a thread que
    atende o POST /messages segue até o fim mesmo depois de o navegador
    largar a conexão. Em vez de tentar matar a chamada, esta rota apaga a
    mensagem do usuário que estava sendo respondida - e o send_message, logo
    antes de gravar, confere se ela ainda existe e desiste se não existir.
    O efeito prático é o combinado com o usuário: a rodada inteira é
    descartada e a conversa volta a ficar como estava.
    """
    chat = get_owned_chat(chat_id, g.user["id"])
    if not chat:
        return jsonify({"error": "Conversa não encontrada"}), 404

    ultima = query_one(
        "SELECT id FROM messages WHERE chat_id = %s AND role = 'user' "
        "ORDER BY created_at DESC LIMIT 1",
        (chat_id,),
    )
    if not ultima:
        return jsonify({"ok": True})

    execute("DELETE FROM messages WHERE id = %s", (ultima["id"],))

    # Se a conversa ficou vazia, era a primeira mensagem - e o título
    # automático veio justamente dela (ver send_message). Desfaz também,
    # senão sobra na barra lateral uma conversa vazia batizada com um texto
    # que não existe mais em lugar nenhum.
    restantes = query_one(
        "SELECT COUNT(*) AS total FROM messages WHERE chat_id = %s", (chat_id,)
    )
    if restantes and restantes["total"] == 0:
        execute("UPDATE chats SET title = %s WHERE id = %s", ("New Chat", chat_id))

    return jsonify({"ok": True})


@chats_api.route("/chats/<chat_id>/personality", methods=["POST"])
@require_auth
def update_chat_personality(chat_id):
    body = request.get_json(silent=True) or {}
    personality = body.get("personality")
    if personality not in PERSONALITIES:
        return jsonify({"error": "Personalidade inválida"}), 400

    execute(
        "UPDATE chats SET personality = %s, updated_at = now() "
        "WHERE id = %s AND user_id = %s",
        (personality, chat_id, g.user["id"]),
    )
    return jsonify({"ok": True})


@chats_api.route("/chats/<chat_id>/effort", methods=["POST"])
@require_auth
def update_chat_effort(chat_id):
    body = request.get_json(silent=True) or {}
    effort = body.get("effort")
    if effort not in EFFORTS:
        return jsonify({"error": "Nível de esforço inválido"}), 400

    execute(
        "UPDATE chats SET effort = %s, updated_at = now() "
        "WHERE id = %s AND user_id = %s",
        (effort, chat_id, g.user["id"]),
    )
    return jsonify({"ok": True})


MAX_INTERESTS = 25
MAX_INTEREST_LENGTH = 60


def _clean_interests(raw):
    """
    Normaliza a lista de interesses do corpo da requisição: só aceita
    lista, tira espaço das pontas, descarta vazios, remove duplicatas
    (mantendo a ordem). O limite existe porque essa lista é reenviada
    pro Gemini a cada mensagem do chat (ver ai.py) - sem limite, um
    valor abusivo aqui vira custo/latência extra em toda conversa, não
    só neste formulário.
    """
    if not isinstance(raw, list):
        return []
    seen = set()
    cleaned = []
    for item in raw:
        tag = str(item).strip()[:MAX_INTEREST_LENGTH] if item is not None else ""
        if tag and tag not in seen:
            seen.add(tag)
            cleaned.append(tag)
        if len(cleaned) >= MAX_INTERESTS:
            break
    return cleaned


@chats_api.route("/account", methods=["POST"])
@require_auth
def update_account():
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()
    image = body.get("image") or None
    display_name = (body.get("displayName") or "").strip() or None
    pronoun = (body.get("pronoun") or "").strip() or None
    interests = _clean_interests(body.get("interests"))

    # Validação equivalente ao updateProfileSchema (zod) do original.
    if len(name) < 2:
        return jsonify({"error": "Nome precisa ter ao menos 2 caracteres"}), 400

    execute(
        "UPDATE users SET name = %s, image = %s, display_name = %s, "
        "pronoun = %s, interests = %s, updated_at = now() WHERE id = %s",
        (name, image, display_name, pronoun, interests, g.user["id"]),
    )
    return jsonify(
        {
            "ok": True,
            "user": {
                **g.user,
                "name": name,
                "image": image,
                "display_name": display_name,
                "pronoun": pronoun,
                "interests": interests,
            },
        }
    )


@chats_api.route("/account/password", methods=["POST"])
@require_auth
def update_password():
    """
    Troca a senha da conta logada, exigindo a senha atual como
    reconfirmação (mesmo padrão de delete_account, que também reconsulta
    a linha inteira de users porque g.user não traz password_hash).
    Diferente de reset_password (auth_api.py), que funciona sem sessão
    via token de e-mail - esta rota exige estar logado.
    """
    body = request.get_json(silent=True) or {}
    current_password = body.get("currentPassword") or ""
    new_password = body.get("newPassword") or ""

    password_errors = get_password_requirement_failures(new_password)
    if password_errors:
        return jsonify({"error": "\n".join(password_errors)}), 400

    full_user = query_one("SELECT * FROM users WHERE id = %s", (g.user["id"],))
    if not full_user or not verify_password(current_password, full_user["password_hash"]):
        return jsonify({"error": "Senha atual incorreta"}), 401

    execute(
        "UPDATE users SET password_hash = %s, updated_at = now() WHERE id = %s",
        (hash_password(new_password), g.user["id"]),
    )
    # Derruba as sessões abertas em outros dispositivos, mas mantém a
    # atual: quem acabou de trocar a senha estando logado não deve ser
    # deslogado da própria tela. Ver docs/processo.md (decisão D-02).
    destroy_all_sessions(g.user["id"], exceto=request.cookies.get(SESSION_COOKIE_NAME))
    return jsonify({"ok": True})


@chats_api.route("/account/export", methods=["GET"])
@require_auth
def export_account_data():
    """
    Exportação dos dados pessoais do usuário logado, em JSON, pro
    frontend disparar o download (settings.js, wireExportDataButton) -
    o mecanismo concreto por trás do direito de portabilidade citado
    na Política de Privacidade (seção 7).

    Datas em ISO-8601 (.isoformat()), diferente do resto da API (que
    devolve datetime cru pro jsonify padrão formatar em RFC-1123): este
    endpoint gera um arquivo pensado pra sair do app, não pra ser
    consumido pelo JS deste app - ISO-8601 é o formato esperado nesse
    caso.
    """
    full_user = query_one("SELECT * FROM users WHERE id = %s", (g.user["id"],))
    if not full_user:
        return jsonify({"error": "Usuário não encontrado"}), 404

    chats = query(
        "SELECT * FROM chats WHERE user_id = %s ORDER BY created_at ASC",
        (g.user["id"],),
    )

    chat_ids = [chat["id"] for chat in chats]
    if chat_ids:
        messages = query(
            "SELECT * FROM messages WHERE chat_id = ANY(%s) ORDER BY created_at ASC",
            (chat_ids,),
        )
    else:
        # ANY(%s) com lista Python vazia vira `= ANY(ARRAY[])`, e o
        # Postgres rejeita isso ("cannot determine type of empty
        # array") - evita a query quando a conta ainda não tem chat.
        messages = []

    messages_by_chat = {}
    for message in messages:
        messages_by_chat.setdefault(message["chat_id"], []).append(
            {
                "id": message["id"],
                "role": message["role"],
                "content": message["content"],
                "createdAt": message["created_at"].isoformat(),
            }
        )

    return jsonify(
        {
            "exportedAt": datetime.now(timezone.utc).isoformat(),
            "profile": {
                "name": full_user["name"],
                "email": full_user["email"],
                "image": full_user["image"],
                "displayName": full_user["display_name"],
                "pronoun": full_user["pronoun"],
                "interests": full_user["interests"],
                "createdAt": full_user["created_at"].isoformat(),
                "updatedAt": full_user["updated_at"].isoformat(),
            },
            "chats": [
                {
                    "id": chat["id"],
                    "title": chat["title"],
                    "createdAt": chat["created_at"].isoformat(),
                    "updatedAt": chat["updated_at"].isoformat(),
                    "messages": messages_by_chat.get(chat["id"], []),
                }
                for chat in chats
            ],
        }
    )


@chats_api.route("/account/delete", methods=["POST"])
@require_auth
def delete_account():
    """
    Apaga a conta de vez (exige a senha atual como reconfirmação).
    schema.sql já tem ON DELETE CASCADE em sessions/chats/
    password_reset_tokens apontando para users, então apagar a linha
    do usuário já limpa tudo o mais.
    """
    body = request.get_json(silent=True) or {}
    password = body.get("password") or ""

    full_user = query_one("SELECT * FROM users WHERE id = %s", (g.user["id"],))
    if not full_user or not verify_password(password, full_user["password_hash"]):
        return jsonify({"error": "Senha incorreta"}), 401

    execute("DELETE FROM users WHERE id = %s", (g.user["id"],))
    response = jsonify({"ok": True})
    return clear_session_cookie(response)