"""
ai.py
=====
Integração com a IA (Gemini) que gera as respostas do TrashTalker.

Diferente do script original (que guardava um histórico `mensagens` em
memória, em uma lista global), aqui a aplicação Flask é stateless entre
requests - o histórico de cada conversa é reconstruído a partir do
banco (ver routes/chats_api.py) e passado inteiro para generate_reply()
a cada chamada.
"""

import os

from google import genai
from google.genai import types

from backend.personalities import DEFAULT_PERSONALITY, get_personality_prompt

TEMPERATURE = 0.7
MAX_OUTPUT_TOKENS = 1024
TOP_P = 0.9

# O Gemini devolve 503 UNAVAILABLE ("this model is currently experiencing
# high demand") de vez em quando - é pico temporário do lado do Google, não
# erro nosso, e a própria mensagem pede pra tentar de novo. O SDK NÃO tenta
# sozinho: sem `retry_options` ele usa a estratégia "never retry"
# (stop_after_attempt(1) em _api_client.retry_args), e o erro sobe na
# primeira falha - virando 502 na cara de quem está conversando.
#
# Os defaults do SDK (5 tentativas, esperas de 1/2/4/8s) são pensados para
# job em lote, não para alguém olhando os "..." na tela. Aqui: 3 tentativas
# no total, esperando ~1s e ~2s. Custa no máximo uns 3s a mais no pior caso
# e resolve a esmagadora maioria dos picos.
RETRY_ATTEMPTS = 3
RETRY_INITIAL_DELAY = 1.0
RETRY_MAX_DELAY = 4.0

# Nível de "esforço" escolhido por conversa: troca o modelo do Gemini.
# O trocadilho é com o nome do projeto - "Trash" é o modelo leve/rápido,
# "Talker" é o modelo maior, que responde melhor mas demora mais.
EFFORTS = {
    "trash": {
        "name": "Trash",
        "subtitle": "Respostas mais rápidas",
        "model": "gemini-3.5-flash-lite",
    },
    "talker": {
        "name": "Talker",
        "subtitle": "Respostas mais caprichadas",
        "model": "gemini-3.5-flash",
    },
}
DEFAULT_EFFORT = "trash"

# Sem o campo "model" - o frontend só precisa do rótulo, e qual modelo
# está por trás de cada opção é detalhe interno (mesma ideia do
# PERSONALITIES_PUBLIC em personalities.py).
EFFORTS_PUBLIC = [
    {"id": key, "name": value["name"], "subtitle": value["subtitle"]}
    for key, value in EFFORTS.items()
]


def get_effort_model(key):
    """
    Modelo do Gemini para o esforço `key`, com fallback para o padrão se
    a chave for desconhecida/vazia - cobre conversas criadas antes desta
    coluna existir e valores inválidos vindos do cliente.
    """
    effort = EFFORTS.get(key) or EFFORTS[DEFAULT_EFFORT]
    return effort["model"]


_client = None


def get_client():
    """Cria o client do Gemini na primeira chamada (lazy), não na importação
    do módulo - assim o app.py não quebra ao subir se GEMINI_API_KEY ainda
    não estiver configurada, só a chamada de chat é que falha."""
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("A variável de ambiente GEMINI_API_KEY não foi definida")
        _client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(
                retry_options=types.HttpRetryOptions(
                    attempts=RETRY_ATTEMPTS,
                    initial_delay=RETRY_INITIAL_DELAY,
                    max_delay=RETRY_MAX_DELAY,
                )
            ),
        )
    return _client


def _to_gemini_contents(history):
    """Converte o histórico {"role": "user"|"assistant", "content": str} do
    banco para o formato `contents` esperado pela API do Gemini - que usa
    "model" no lugar de "assistant" para as respostas da IA."""
    contents = []
    for m in history:
        role = "model" if m["role"] == "assistant" else "user"
        contents.append(
            types.Content(role=role, parts=[types.Part.from_text(text=m["content"])])
        )
    return contents


def _build_user_context_section(user):
    """
    Bloco anexado ao fim do SYSTEM_PROMPT em cada chamada, com o que a
    IA sabe sobre a pessoa (apelido/pronome/interesses do perfil - ver
    routes/chats_api.py:update_account). Nome sempre entra (users.name
    é NOT NULL); apelido, pronome e interesses só entram se existirem,
    pra não mandar instrução vazia pro modelo. Esse bloco é o mesmo (e
    é anexado da mesma forma) qualquer que seja a personalidade
    escolhida pra conversa (ver personalities.py) - só acrescenta
    contexto sobre quem está falando, não define a personalidade em si.
    """
    display_name = (user.get("display_name") or user.get("name") or "").strip()
    pronoun = (user.get("pronoun") or "").strip()
    interests = [i for i in (user.get("interests") or []) if i]

    lines = [
        "# SOBRE A PESSOA COM QUEM VOCÊ ESTÁ FALANDO",
        "- O nome da pessoa é " + display_name + ". Chame a pessoa pelo nome de "
        "vez em quando, do jeito que um amigo faria - não precisa ser em toda "
        "mensagem, só quando soar natural (numa saudação, pra puxar assunto, pra "
        "dar ênfase).",
    ]

    if pronoun:
        lines.append("- Use o pronome '" + pronoun + "' pra se referir a essa pessoa.")

    if interests:
        lines.append(
            "- Interesses da pessoa: " + ", ".join(interests) + ". Puxe assunto "
            "com isso quando fizer sentido, faça analogias, mostre que prestou "
            "atenção - sem citar a lista como se fosse um checklist."
        )

    lines.append(
        "- Use essas informações com naturalidade, como um amigo que já conhece "
        "a pessoa. Nunca liste esses dados de volta pra pessoa, nunca repita esse "
        "bloco como se fosse um formulário, e não force menção a eles se não vier "
        "a calhar na conversa."
    )

    return "\n".join(lines)


def generate_reply(
    history, user, personality=DEFAULT_PERSONALITY, effort=DEFAULT_EFFORT
):
    """
    history: lista de dicts {"role": "user"|"assistant", "content": str},
    ordenada da mensagem mais antiga para a mais recente (já inclui a
    mensagem atual do usuário).
    user: dict do usuário logado (ver auth.get_session_user), usado só
    para personalizar o system prompt com nome/pronome/interesses (ver
    _build_user_context_section).
    personality: chave da personalidade a usar (ver
    backend/personalities.py) - default DEFAULT_PERSONALITY, pra
    qualquer chamador que não pense em personas ter o mesmo
    comportamento de antes.
    effort: chave do nível de esforço (ver EFFORTS acima), que decide
    qual modelo do Gemini responde.
    Devolve o texto da resposta da IA.
    """
    system_prompt = get_personality_prompt(personality) + "\n\n" + _build_user_context_section(user)
    model = get_effort_model(effort)

    config_kwargs = dict(
        system_instruction=system_prompt,
        temperature=TEMPERATURE,
        max_output_tokens=MAX_OUTPUT_TOKENS,
        top_p=TOP_P,
        # Não declaramos nenhuma ferramenta (function calling) - o modelo só
        # devolve texto. Sem desligar isso explicitamente, o SDK imprime um
        # aviso sobre "automatic function calling" a cada chamada, sujando o
        # log sem que haja nada de fato para chamar.
        automatic_function_calling=types.AutomaticFunctionCallingConfig(
            disable=True
        ),
    )
    # Modelos "cheios" (flash/pro) fazem "thinking" interno por padrão, e
    # esses tokens de raciocínio saem do MESMO orçamento do
    # max_output_tokens (apesar da doc sugerir que são separados) - sem
    # desligar isso, a resposta visível vinha sendo cortada no meio.
    # Modelos "lite" já vêm com thinking desligado por padrão e - testado
    # na prática - RECUSAM thinking_budget=0 explícito (400
    # INVALID_ARGUMENT), então só mandamos esse parâmetro pros modelos
    # que de fato precisam dele.
    if "lite" not in model:
        config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=0)

    response = get_client().models.generate_content(
        model=model,
        contents=_to_gemini_contents(history),
        config=types.GenerateContentConfig(**config_kwargs),
    )

    if not response.text:
        # Acontece quando os filtros de segurança do Gemini bloqueiam a
        # resposta (finish_reason SAFETY, por exemplo) - o try/except em
        # chats_api.py transforma isso na mensagem de erro genérica.
        raise RuntimeError(
            "Resposta vazia ou bloqueada pelos filtros de segurança do Gemini"
        )
    return response.text