"""
routes/auth_api.py
===================
Endpoints de autenticação: login, cadastro, logout, sessão atual,
"esqueci minha senha" e redefinição de senha.

Equivalente a:
  - src/routes/auth-forms.ts (login, signup, logout)
  - as rotas /api/auth/forget-password e /api/auth/reset-password que o
    better-auth expunha automaticamente e que o JS do frontend chamava
    direto (public/js/auth.js)

Diferença de arquitetura importante: no projeto original, /login e /signup
eram rotas que RENDERIZAVAM uma página EJS de novo em caso de erro (ou
redirecionavam em caso de sucesso). Aqui, como o frontend é HTML estático
puro, essas rotas passam a devolver sempre JSON - é o JavaScript do
frontend (frontend/js/login.js, signup.js, etc.) que decide o que mostrar
na tela ou para onde navegar.
"""

import os
import re

from flask import Blueprint, jsonify, request

from backend.email_utils import send_password_reset_email
from backend.auth import (
    clear_session_cookie,
    consume_password_reset_token,
    create_password_reset_token,
    create_session,
    destroy_all_sessions,
    destroy_session,
    get_password_requirement_failures,
    get_session_user,
    hash_password,
    set_session_cookie,
    verify_password,
    SESSION_COOKIE_NAME,
)
from backend.db import execute, new_id, query_one

auth_api = Blueprint("auth_api", __name__, url_prefix="/api")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _public_user(user):
    """Remove campos internos antes de devolver o usuário para o frontend."""
    if not user:
        return None
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "image": user.get("image"),
        "display_name": user.get("display_name"),
        "pronoun": user.get("pronoun"),
        "interests": user.get("interests") or [],
    }


@auth_api.route("/me", methods=["GET"])
def me():
    """Devolve o usuário logado atualmente (ou 401 se não houver sessão)."""
    user = get_session_user(request)
    if not user:
        return jsonify({"error": "Não autenticado"}), 401
    return jsonify({"user": _public_user(user)})


@auth_api.route("/login", methods=["POST"])
def login():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""

    # Validação equivalente ao loginSchema (zod) do original.
    if not EMAIL_RE.match(email) or len(password) < 8:
        return jsonify({"error": "Email ou senha inválidos"}), 400

    user = query_one("SELECT * FROM users WHERE email = %s", (email,))
    if not user or not verify_password(password, user["password_hash"]):
        return jsonify({"error": "Email ou senha incorretos"}), 401

    token, expires_at = create_session(user["id"])
    response = jsonify({"user": _public_user(user)})
    return set_session_cookie(response, token, expires_at)


@auth_api.route("/signup", methods=["POST"])
def signup():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    name = (body.get("name") or "").strip()

    # Validação equivalente ao signupSchema (zod) do original, com a
    # política de senha forte descrita em get_password_requirement_failures.
    if not EMAIL_RE.match(email):
        return jsonify({"error": "Email inválido"}), 400
    password_errors = get_password_requirement_failures(password)
    if password_errors:
        return jsonify({"error": "\n".join(password_errors)}), 400
    if len(name) < 1:
        return jsonify({"error": "Nome é obrigatório"}), 400

    existing = query_one("SELECT id FROM users WHERE email = %s", (email,))
    if existing:
        return jsonify({"error": "Este email já está cadastrado"}), 409

    user_id = new_id()
    execute(
        "INSERT INTO users (id, name, email, password_hash) "
        "VALUES (%s, %s, %s, %s)",
        (user_id, name, email, hash_password(password)),
    )

    # Igual ao original: signup NÃO loga o usuário automaticamente, ele
    # é redirecionado para a tela de login (ver frontend/js/signup.js).
    return jsonify({"ok": True}), 201


@auth_api.route("/logout", methods=["POST"])
def logout():
    token = request.cookies.get(SESSION_COOKIE_NAME)
    destroy_session(token)
    response = jsonify({"ok": True})
    return clear_session_cookie(response)


@auth_api.route("/forgot-password", methods=["POST"])
def forgot_password():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()

    user = query_one("SELECT * FROM users WHERE email = %s", (email,))
    if user:
        token = create_password_reset_token(user["id"])
        frontend_origin = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5000")
        reset_url = f"{frontend_origin}/reset-password?token={token}"
        try:
            send_password_reset_email(user["email"], reset_url)
        except Exception as e:
            # SMTP não configurado, credenciais erradas, etc.: cai para
            # o fallback de console em vez de quebrar a resposta - o
            # link ainda funciona, só não chega por e-mail.
            print(f"[AVISO] Falha ao enviar e-mail de redefinição: {e}")
            print("\n========================================")
            print("[LINK DE REDEFINIÇÃO DE SENHA]")
            print(f"Para: {user['email']}")
            print(f"URL: {reset_url}")
            print("========================================\n")

    # Sempre devolvemos sucesso, exista ou não o email - isso evita que
    # alguém descubra quais emails estão cadastrados testando um por um.
    return jsonify({"ok": True})


@auth_api.route("/reset-password", methods=["POST"])
def reset_password():
    body = request.get_json(silent=True) or {}
    token = body.get("token") or ""
    new_password = body.get("newPassword") or ""

    password_errors = get_password_requirement_failures(new_password)
    if password_errors:
        return jsonify({"error": "\n".join(password_errors)}), 400

    user_id = consume_password_reset_token(token)
    if not user_id:
        return jsonify({"error": "Link inválido ou expirado"}), 400

    execute(
        "UPDATE users SET password_hash = %s, updated_at = now() WHERE id = %s",
        (hash_password(new_password), user_id),
    )
    # Quem redefine a senha por e-mail normalmente é alguém que perdeu o
    # acesso - possivelmente porque outra pessoa entrou na conta. Derrubar
    # todas as sessões abertas é o que faz a troca de senha realmente
    # expulsar quem não deveria estar lá.
    destroy_all_sessions(user_id)
    return jsonify({"ok": True})