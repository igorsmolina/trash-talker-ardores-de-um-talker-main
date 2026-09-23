# Relatório de implementação — Conversa de bolso

Data: 20/09/2026. Branch: `redesign-socializacao`.
Base: `7833bf9a0eb2305e71bc50605a1bb75b8d7d82ba` (main).
[Plano aprovado](redesign-plano.md).

## Resultado

Redesign implementado nas onze páginas com HTML, CSS e JavaScript puros.
Nenhuma dependência adicionada. Backend, rotas, autenticação, banco e formatos
das requisições/respostas foram preservados. A logo original não foi alterada.

- Sistema visual no arquivo existente `frontend/css/redesign.css`; sem terceira
  camada global de correções. `app.css` continua fornecendo a estrutura reutilizada.
- Amarelo #F7D834, branco e papel no claro; tinta, superfície escura e laranja no escuro.
- Fonte do sistema; títulos compactos, balões e alinhamento comum para mensagens e compositor.
- Home com slogan original e exemplos estáticos. Formulários em coluna até 440px,
  com pequenos balões no desktop e sem ilustração lateral no celular.
- Sidebar 280px, gaveta abaixo de 1024px, renomeação/exclusão e opções preservadas.
- Avatar, apelido, pronome e interesses identificados como opcionais. Nome obrigatório.
- Textos legais intactos. Cadastro informa corretamente que também solicita nome.
- Sem preloader artificial, revelação progressiva de respostas, animação por seção
  ou movimento decorativo no hover. Menus/modais/gaveta com transições até 160ms.
- Regras de senha continuam aparecendo somente enquanto o campo está em foco.
- Tema salvo prevalece; sem escolha, acompanha o sistema antes da primeira pintura.
  Negação de localStorage não impede renderização ou troca temporária de tema.

## Conversa e socialização

Os experimentos estão isolados em `frontend/js/socializacao.js` e
`frontend/css/socializacao.css`. Recursos:

1. Três sugestões preenchem e focalizam o campo sem enviar; substituição de rascunho
   depende de confirmação. Após o diálogo, o foco retorna ao compositor.
2. Seis situações de ensaio, com situação/papel editáveis e modelo revisto antes do envio.
   Ao partir de uma conversa existente, abre-se uma nova conversa, não se reutiliza
   silenciosamente o contexto anterior. Marcador “Ensaio (beta)” local por conta/conversa.
3. Sair do ensaio abre a tela de nova conversa; o histórico anterior permanece.
4. Próximo passo escrito pelo usuário, salvo apenas por ação explícita, editável/apagável.
   Não entra em nenhum pedido de mensagem à IA. Falhas mantêm o rascunho no painel
   e informam que não houve gravação.
5. Pausa após 20 minutos de atividade, com amostragem a cada 5s e interação recente
   definida como até 60s. Somente página visível; adiada enquanto há geração;
   uma vez por sessão da aba. Sem sessionStorage disponível, a pausa é omitida
   para não repetir avisos sem controle confiável de sessão.
6. Identificação textual de TrashTalker/MathIAs nas respostas novas; monograma SVG
   próprio para MathIAs. Histórico sem metadados confiáveis permanece “IA”.
7. Passagem anunciada com base em handoffMessage e personalidade devolvida pela API,
   sem afirmar detecção emocional.
8. “Parar e desfazer envio” informa o comportamento existente. A mensagem otimista
   só é removida após confirmação do cancelamento. Falhas preservam o rascunho e
   oferecem reabertura do histórico; reenvio fica bloqueado para evitar duplicação.
9. “Mais rápida”/“Mais elaborada” mantêm os valores trash/talker. Erros de rede e voz
   aparecem em avisos acessíveis próximos da ação, sem alert nativo.
10. Privacidade e limites da IA junto ao compositor, sem promessa terapêutica.

### Estado local e privacidade

Chaves: `tt-social:v1:<userId>:<chatId>`, contendo apenas `rehearsal` e `note`.
Transferência de modelo para nova conversa usa sessionStorage separado por usuário.
Pausa usa sessionStorage por aba. Rascunhos não salvos permanecem somente em memória.

Usuário identificado por resposta autenticada de /api/dashboard, não por texto do DOM.
Dados são removidos depois de exclusão confirmada da conversa/conta. Falha de limpeza
local gera aviso, distinto de falha de exclusão no servidor. Logout limpa a memória;
restauração por cache de navegação força nova identificação antes de reutilizar a página.

A exportação baixada pelo frontend acrescenta `socializacaoLocal`, explicitamente
identificado como dados deste navegador. A resposta da API permanece intacta.
A exportação real usa `profile`, não `user`; a identidade é conferida antes de anexar notas.

Armazenamento local não é criptografia nem proteção contra outra pessoa com acesso
ao mesmo perfil do navegador. Notas não são sincronizadas entre dispositivos.
Se o armazenamento estiver indisponível, marcadores locais não podem ser garantidos.

### Desligar o beta

Em `frontend/js/socializacao.js:3`, trocar:

```js
const SOCIALIZACAO_BETA_ENABLED = false;
```

Recarregar a página. Isso remove sugestões, ensaios, próximo passo e pausa, mantendo
o chat, personalidades, esforço, voz, histórico e formulários. Exportação e limpeza
continuam reconhecendo dados locais antigos, para não deixá-los sem gerenciamento.

## Integrações e seletores

Eventos explícitos `tt:user`, `tt:chat`, `tt:created`, `tt:response`,
`tt:generating`, `tt:deleted`, `tt:account-deleted` e `tt:logout`,
emitidos por `ui.js`, `layout.js`, `chat.js` e `settings.js`.
Nenhum observador de texto do DOM é usado para inferir eventos.

Preservados: IDs dos formulários, campos, compositor, mensagens e navegação,
`.msg-content`, `data-theme-btn`, `data-avatar-id` e seletores da gaveta.
Novas classes: `.msg-author`, `.msg-mathias`, `.msg-trashtalker`,
`.handoff-message`, `.ui-message`, `.welcome-writing` e `.social-*`.
Novos campos dos painéis têm IDs próprios e labels associados.

Retirados apenas os elementos do preloader (`ttPreloader`/`ttPct`) e a
composição ilustrada decorativa substituída por balões. Os assets antigos não
foram apagados. “Nova conversa” agora abre o compositor inicial e só cria o
registro quando a primeira mensagem é enviada, permitindo escolher opções antes.

Testes antigos de imagem lateral foram atualizados deliberadamente para a pequena
composição adaptável ao tema. Testes de esforço agora esperam o texto aprovado,
mas continuam conferindo o valor talker enviado à API. Preservação integral de texto
é exigida para páginas legais e slogan; demais microtextos aprovados podem mudar.
IDs, links e placeholders anteriores continuam verificados, exceto o preloader retirado.

## Verificação executada

Todos os testes de navegador usam servidor local isolado, respostas simuladas e
dados fictícios. Não criam contas reais, não chamam a IA e não acessam banco.

| Verificação | Resultado |
|---|---|
| Baseline anterior | 110 verificações de tela e 30 de senha aprovadas |
| Matriz final | 110 verificações: 11 páginas × 5 larguras × 2 temas |
| Regras de senha | 30 verificações de foco, teclado, regras e ocultação |
| Cenários adicionais | 28 aprovados |
| Conteúdo preservado | Páginas legais, slogan, IDs funcionais, links e placeholders conferidos contra a base |
| Erros do navegador/alertas nativos inesperados | Nenhum nos fluxos testados |
| Backend/asset da logo | Sem alterações comparados à base |
| pytest e Behave | Bloqueados pelo ambiente; não são aprovação funcional |
| Dispositivo móvel e leitor de tela reais | Não disponíveis nesta sessão |

Cenários adicionais e regressão: sugestões sem envio, cancelar/confirmar substituição,
modelo personalizado, marcador e saída de ensaio, ensaio a partir do histórico,
notas (criar/editar/apagar/exportar), quota/armazenamento negados, troca de conta,
logout, passagem de personalidade, erro de rede, cancelamento com falha,
cancelamento antes de criar conversa, exclusão confirmada/falha, exclusão de conta,
pausa com relógio simulado (inatividade, página oculta e geração),
preferência do sistema/salva, beta desligado, voz indisponível/erro/ditado sem envio,
cadastro, login, recuperação e alteração de senha. Regressão também cobre
renomeação, seletor por teclado, esforço, avatar/interesses, reset e modais.

Larguras: 320, 360, 768, 1024 e 1280px. Sem overflow horizontal detectado.
Conteúdo longo e ampliação de layout de 200% foram exercitados com CSS zoom;
isso não equivale a uma validação manual do zoom nativo em todos os navegadores.
Foco, armadilhas de Tab/Escape, nomes acessíveis e regiões de mensagens foram
verificados por automação. Não foi feita leitura real com NVDA/VoiceOver.
Emulação de viewport não é prova de funcionamento do teclado virtual real.

### Contraste medido

| Par | Claro | Escuro |
|---|---:|---:|
| Texto/fundo | 14,71:1 | 14,71:1 |
| Texto/superfície | 16,13:1 | 12,64:1 |
| Ação principal | 11,39:1 | 5,12:1 |
| Foco/superfície | 16,13:1 | 9,78:1 |
| Texto secundário/superfície | 6,67:1 | 7,40:1 |

Resultados completos: [validation.json](../artifacts/conversa-de-bolso/validation.json).

### Capturas

Pasta [conversa-de-bolso](../artifacts/conversa-de-bolso/): 123 PNGs
(110 telas, 10 estados de senha e 3 estados beta), além do resultado JSON.

- [Home clara, 1280px](../artifacts/conversa-de-bolso/index-light-1280.png)
- [Home escura, 1280px](../artifacts/conversa-de-bolso/index-dark-1280.png)
- [Login claro, 1280px](../artifacts/conversa-de-bolso/login-light-1280.png)
- [Conversa clara, 360px](../artifacts/conversa-de-bolso/chat-light-360.png)
- [Conversa escura, 768px](../artifacts/conversa-de-bolso/chat-dark-768.png)
- [Ensaio, 360px](../artifacts/conversa-de-bolso/ensaio-light-360.png)
- [Próximo passo, 360px](../artifacts/conversa-de-bolso/proximo-passo-light-360.png)
- [Passagem de personalidade, 360px](../artifacts/conversa-de-bolso/passagem-light-360.png)

### Como reproduzir os testes de interface neste ambiente

```powershell
$env:NODE_PATH='C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
$env:PW_CHANNEL='msedge'
node python-app/tools/redesign-smoke.cjs
```

Playwright e Edge já existentes no ambiente foram reutilizados, sem instalação.
`SKIP_VIEWS=1` serve apenas para rodada funcional rápida; não substitui a matriz final.
As duas ferramentas de testes estão em `python-app/tools/`.

### Bloqueio de backend

pytest e Behave foram tentados antes e depois. Ambos falharam antes de carregar
as suítes: o venv aponta para o Python da WindowsApps, cujo executável está
inacessível (“Access is denied”). A invocação direta final do launcher devolveu
código 103; as tentativas iniciais via PowerShell foram reportadas como código 1.
`TEST_DATABASE_URL` não está definida. Nenhum banco foi usado.

Para concluir essa etapa será necessário um venv funcional e um banco de teste
separado. Não executar essas suítes com o banco de desenvolvimento, pois há
rotinas destrutivas de preparação de dados. Não foram instaladas dependências,
alteradas credenciais nem reparado o ambiente de backend nesta implementação.

## Auditoria de interface

Revisão orientada pelas
[Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md),
com prevalência das decisões do projeto (capitalização de frase, sem novas dependências).
Aplicados controles semânticos, labels, foco visível, avisos inline, tecla Escape,
contenção de foco nos modais/gaveta, conteúdo longo, contraste, safe area,
preferência de cor e movimento reduzido. Texto do usuário é inserido por textContent/value,
não interpolado como HTML.

Pendências de validação manual: leitor de tela real, zoom nativo em outros
navegadores, navegador/dispositivo móvel com teclado virtual, ditado/leitura com
microfone e áudio reais, testes de integração com backend e provedor disponíveis.
Os testes de voz aqui são de comportamento da interface, não de qualidade do áudio.

## Pendências de backend — sem implementação

| Tema | Evidência atual | Necessidade futura |
|---|---|---|
| Autoria histórica | `backend/schema.sql:66`, `routes/chats_api.py:139` e `:453` | Persistir personalidade por mensagem; hoje role/content não permitem atribuição confiável |
| Passagem por conteúdo emocional | `backend/personalities.py:140` e `:159` | A regra atual é MathIAs + comprimento acima de 800 caracteres, não avaliação emocional |
| Garantias de ensaio | `backend/ai.py:156` e `:174` | O frontend envia um modelo editável; não existe contrato de modo ensaio garantido |
| Cancelamento real | `backend/routes/chats_api.py:170` e `:245` | A chamada bloqueante ao provedor continua; apenas a persistência é tratada |
| Correlação do cancelamento | `backend/routes/chats_api.py:263` | A rota busca a última mensagem de usuário, sem ID de requisição. Corridas entre envio/cancelamento precisam de tratamento no backend |
| Cadastro sem nome | `backend/routes/auth_api.py:96` e `:105`; `backend/routes/chats_api.py:349` e `:356` | Nome continua obrigatório; validações de cadastro e atualização são diferentes |

Os resultados simulados não comprovam ausência dessas limitações no backend.
Nenhuma delas foi escondida por novos rótulos de personalidade ou de cancelamento.

## Commits e arquivos do usuário

- `e7d768b`: sistema visual e plano.
- `e1dd8d8`: navegação, formulários e avisos acessíveis.
- `aa82394`: socialização beta e integração com conversa/estado local.
- Commit separado de testes, capturas e este relatório.

`python-app/docs/proposta-do-site.md` foi preservado e não incluído nos commits.
As capturas antigas em `artifacts/redesign` foram mantidas como estavam na base;
os resultados novos ficam em uma pasta própria. Nenhum push ou deploy foi feito.

