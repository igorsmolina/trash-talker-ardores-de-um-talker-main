# PROGRESSO

Registro de estado da revisão orientada ao CMMI do projeto Trash Talker.
Se uma sessão for interrompida, leia este arquivo antes de continuar.

**Última atualização:** 25/08/2026
**Ambiente da revisão:** container Linux efêmero, cópia do repositório
clonada de `github.com/igorsmolina/trash-talk-cronicas-de-um-talker-main`,
PostgreSQL 16 local para os testes.

---

## FASE 1 — DIAGNÓSTICO

**Status:** CONCLUÍDA

**Realizado:** reconhecimento completo do repositório (estrutura, ponto
de entrada, rotas, modelos, dependências, configuração, documentação,
testes, integrações, pontos de segurança) e avaliação diagnóstica das
cinco áreas.

**Evidências:**
- `python3 --version` → Python 3.12.3
- `flask --app app routes` → 17 endpoints de API + 11 rotas de página
  (falhava sem `DATABASE_URL` antes da correção — ver Fase 3)
- `git log` → 6 commits; `git log -S` confirma credencial presente desde
  o commit inicial `1e26c7b`
- Contagem de linhas: 5.728 no total, backend com ~1.100

**Avaliação diagnóstica** (escala interna, **não** classificação oficial
de CMMI):

| Área | Antes | Evidência |
|---|---|---|
| Requisitos e planejamento | Inicial | Requisitos existiam só como prosa no README; sem critérios de aceitação, sem rastreabilidade |
| Solução técnica e design | Gerenciado | Camadas separadas (`app`/`db`/`auth`/`ai`/`routes`), SQL parametrizado, comentários explicando o porquê |
| Verificação e validação | Inexistente | Nenhum teste automatizado; o próprio README listava isso como pendência |
| Gestão de riscos | Inicial | Alguns riscos citados no README (CSRF, rate limiting), sem registro nem acompanhamento |
| Processos e melhoria | Inicial | Sem definição de pronto, sem convenções escritas, sem fluxo de testes |

**Prioridades:** P0 — credencial vazada, `.env.example` com a chave
errada, impossibilidade de testar. P1 — invalidação de sessão, nome do
modelo Gemini, rate limiting. P2 — CSRF, limites de tamanho,
truncamento de histórico. P3 — logging, testes de frontend.

---

## FASE 2 — PLANO DE RETRABALHO

**Status:** CONCLUÍDA

| ID | Prio | Categoria | Problema | Critério de conclusão | Situação |
|---|---|---|---|---|---|
| A-01 | P0 | Segurança | Credencial do Neon em texto puro no README público | Removida do arquivo + risco registrado + rotação instruída | Feito (rotação pendente com o autor) |
| A-02 | P0 | Infra | `.env.example` pede `GROQ_API_KEY`; código lê `GEMINI_API_KEY` | Template corresponde ao código | Feito |
| A-03 | P0 | Código | `app.py` conecta ao banco na importação; impede qualquer teste | `import app` funciona sem `DATABASE_URL` | Feito |
| A-04 | P0 | Testes | Nenhuma infraestrutura de testes | pytest + Behave rodando contra banco isolado | Feito |
| A-05 | P1 | Segurança | Troca de senha não invalida sessões | Sessões derrubadas + teste de regressão | Feito |
| A-06 | P1 | Testes | Sem cobertura dos caminhos críticos | Caminho feliz, alternativo e de erro cobertos | Feito |
| A-07 | P1 | Documentação | README contradiz a si mesmo e cita arquivo inexistente | README bate com o código | Feito |
| A-08 | P1 | Processo | Sem processo definido nem registro de risco | `docs/processo.md` com decisões e riscos | Feito |
| A-09 | P1 | Infra | Nome do modelo Gemini não confirmado | Verificado com `models.list()` | **Pendente — exige chave de API** |
| A-10 | P2 | Segurança | Sem rate limiting | Limite em login/signup/forgot-password | Não iniciado |
| A-11 | P2 | Segurança | Sem CSRF token | Token nas rotas de escrita | Não iniciado |
| A-12 | P2 | Código | Histórico inteiro enviado à IA | Truncamento para as últimas N mensagens | Não iniciado |

---

## FASE 3 — BASE DE TESTES

**Status:** CONCLUÍDA

**Realizado:** `tests/conftest.py` com banco PostgreSQL isolado,
`TRUNCATE` antes de cada teste, fixtures (`cliente`, `usuario_logado`,
`conversa`, `ia_falsa`, `ia_quebrada`) e três travas de segurança.
`pytest.ini` criado.

**Alteração de código necessária:** `db.init_pool()` passou a aceitar
DSN opcional; `create_app()` passou a repassá-lo; `app = create_app()`
saiu do nível do módulo (decisão D-01). Compatível com o uso anterior —
`python app.py` e `flask --app app routes` verificados.

**Problema encontrado e corrigido:** o `import app` disparava conexão ao
banco, quebrando a coleta do pytest. Causa raiz corrigida, não
contornada.

---

## FASE 4 — GHERKIN

**Status:** CONCLUÍDA

Três arquivos `.feature`, todos com `# language: pt`:
`autenticacao.feature` (11 cenários), `conversas.feature` (12),
`conta.feature` (10). Cobrem caminho feliz, alternativo, entrada
inválida, erro esperado, regra de negócio, autorização e persistência.

---

## FASE 5 — STEP DEFINITIONS

**Status:** CONCLUÍDA

`features/environment.py` + quatro arquivos de passos
(`passos_comuns.py`, `passos_autenticacao.py`, `passos_conversas.py`,
`passos_conta.py`). Todos interagem via `test_client()` do Flask; o
banco é consultado apenas para **verificar** efeito real, nunca para
produzir o resultado esperado.

---

## FASE 6 — EXECUÇÃO E CORREÇÃO

**Status:** CONCLUÍDA

**Falha encontrada:** 1 cenário em erro (`Nome muito curto é recusado`).
Comando: `python3 -m behave`. Erro: passo indefinido — o parser do
Behave não casa `{placeholder}` com string vazia.
**Causa raiz:** o `.feature` passava `interesses ""`.
**Correção:** passo dedicado `eu atualizo meu perfil com o nome "{nome}"`,
que também deixou o cenário mais legível. O teste não foi afrouxado.

Resultado após correção: 64/64 pytest, 33/33 Behave.

---

## FASE 7 — VALIDAÇÃO DE REGRESSÃO

**Status:** CONCLUÍDA

| Verificação | Comando | Resultado |
|---|---|---|
| Suíte pytest | `python3 -m pytest` | 64 passed, 0 failed |
| Suíte Behave | `python3 -m behave` | 33 scenarios, 138 steps, 0 failed |
| Trava sem `TEST_DATABASE_URL` | pytest e behave | Ambos recusaram rodar |
| Trava com URL igual à de dev | pytest | Recusou rodar |
| App sobe de verdade | `python3 app.py` + curl | `/` 200, `/login` 200, `/dashboard` 200, `/api/me` 401, `/css/app.css` 200, `/dashboard/information` 302 |
| Descoberta da factory | `flask --app app routes` | 28 rotas listadas |

**NÃO EXECUTADO:** lint/análise estática (ruff/flake8 não instalados no
ambiente da revisão). Chamada real ao Gemini (exigiria chave de API e
geraria custo). Conexão ao banco Neon de produção (deliberadamente
evitada).

---

## FASE 8 — DOCUMENTAÇÃO

**Status:** CONCLUÍDA

- `README.md` corrigido: credencial removida, contradição do "Stage 3"
  resolvida, afirmação errada sobre e-mail corrigida, árvore de arquivos
  atualizada, arquivo inexistente removido, seção de testes adicionada
- `docs/processo.md` criado: convenções, fluxo, definição de pronto,
  seis decisões técnicas (D-01 a D-06), registro de 11 riscos
- `docs/testes.md` criado: como rodar, por que banco separado, cobertura
  atual e lacunas explícitas

Limite de três arquivos de documentação respeitado.

---

## SITUAÇÃO APÓS A REVISÃO

| Área | Antes | Depois | O que mudou |
|---|---|---|---|
| Requisitos e planejamento | Inicial | Gerenciado | 33 cenários Gherkin funcionam como critérios de aceitação executáveis |
| Solução técnica e design | Gerenciado | Gerenciado/Definido | Factory pattern; decisões registradas |
| Verificação e validação | Inexistente | Definido | 64 testes + 33 cenários, reproduzíveis por comando único |
| Gestão de riscos | Inicial | Gerenciado | 11 riscos com severidade e situação |
| Processos e melhoria | Inicial | Gerenciado/Definido | Processo escrito com definição de pronto |

Escala usada como **avaliação diagnóstica interna**. Não constitui
classificação oficial de CMMI, nem *Capability Level* de Practice Area,
nem *Maturity Level*. Uma appraisal formal é uma atividade distinta,
conduzida por avaliador certificado.

---

## PENDÊNCIAS

**Exige ação do autor (fora do código):**
1. **Rotacionar a credencial do Neon** (R-01). Prioridade máxima.
2. Confirmar o nome do modelo em `ai.py` (R-02, A-09).

**Próximo passo planejado:** rate limiting em login/signup/
forgot-password (A-10), o maior risco de segurança ainda aberto no
código.

**Depois:** CSRF token (A-11), truncamento do histórico enviado à IA
(A-12), `MAX_CONTENT_LENGTH`, limite de tamanho do avatar, trocar
`traceback.print_exc()` por `logging`.

**Não iniciado por escolha:** testes de frontend (exigiriam
Selenium/Playwright), testes de carga.
