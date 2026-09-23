# Plano aprovado — Conversa de bolso

Data: 20/09/2026. Branch solicitada: `redesign-socializacao`, a partir da situação atual.
A proposta não versionada `proposta-do-site.md` não faz parte desta entrega.

## Direção e limites
HTML, CSS e JavaScript puros, sem dependências novas, mudanças no backend, banco,
autenticação ou contratos da API. Preservar logo original, amarelo #F7D834,
slogan, textos legais, conteúdo das conversas e funcionalidades existentes.
Microtextos de botões, instruções e avisos podem ser revistos.
Direção aprovada: Conversa de bolso. Ponto de encontro está descartada.

## Sistema visual
Fundo claro #F4F5EF; superfícies #FFFFFF; tinta/fundo escuro #2D1D1A;
superfície escura #332B27; amarelo #F7D834 e laranja #EB6A40.
Foco tinta no claro e amarelo no escuro. Amarelo nunca como texto pequeno em branco.
Fonte system-ui, Segoe UI, Arial; ajuda 14px, corpo/controles 16px,
títulos 20/28/40px, entrelinha 1,55, leitura até 68ch.
Alvos 44px; campos 48px; balões 16px de padding e raio. Sombra só em menus/modais.
Remover serifada editorial, rótulos monoespaçados/caixa alta, grandes ilustrações,
movimento no hover, digitação simulada, animação por seção e preloader artificial.
Transições de abertura/fechamento até 160ms; respeitar movimento reduzido.

## Telas e navegação
Manter as onze páginas. Home compacta com slogan e exemplos estáticos.
Auth e recuperação: coluna até 440px à esquerda, pequenos balões laterais no
desktop; logo e formulário no celular. Sidebar 280px; gaveta abaixo de 1024px.
Histórico permite retomar, renomear e excluir. Chat até 720px e compositor inferior.
Perfil: campos opcionais claramente identificados, nome continua obrigatório.
Configurações agrupadas por aparência, senha e dados; exclusão separada.
Legais: apenas apresentação. Regras de senha somente com campo em foco.

## Socialização beta
Isolar em socializacao.js/css, com um único SOCIALIZACAO_BETA_ENABLED.
Desativar remove sugestões, ensaio, próximo passo e pausa sem afetar chat.
Integrações explícitas: usuário identificado, conversa carregada/criada, geração,
resposta, exclusão confirmada e logout. Não inferir eventos por textos do DOM.

Três sugestões: colega novo, festa e desabafo. Apenas preencher/focar; nunca enviar.
Confirmar antes de substituir rascunho.
Ensaiar conversa (beta): iniciar conversa, pedir ajuda, recusar convite, reencontrar
amigo, entrevista ou situação personalizada. Situação e papel editáveis:
“Quero ensaiar: [situação]. Faça o papel de [pessoa], responda curto, e me dê um retorno ao final.”
Marcador local por conta e conversa criada. Sair abre nova conversa normal,
preservando histórico e contexto. Não prometer garantias do modelo.

Levar para a vida real (beta): nota escrita pela pessoa, salvar explicitamente,
editar/apagar; localStorage por usuário/conversa, sem sincronização/envio à IA.
Falhas mantêm rascunho e avisam que não foi salvo.
Pausa dispensável após 20 minutos de atividade visível e recente, uma vez por
sessão da aba, nunca durante geração. Sem notificações externas, metas ou sequências.

## Personalidades e transparência
TrashTalker usa logo original e balão arredondado; MathIAs usa monograma SVG,
detalhe laranja e canto distinto. Histórico sem autoria confiável recebe “IA”.
Passagem utiliza handoffMessage e personalidade da API, com aviso:
“O TrashTalker assumiu para continuar esta conversa mais longa.”
Não alegar detecção emocional: regra atual é comprimento.
Botão de geração “Parar e desfazer envio”; falha de cancelamento não confirma exclusão.
Esforço “Mais rápida” / “Mais elaborada” mantém valores trash/talker.
Erros inline acessíveis substituem alerts nativos.
Privacidade junto ao campo: “Evite enviar dados financeiros, documentos ou informações de saúde.”
Explicar limites da IA sem promessa terapêutica.

## Dados e compatibilidade
Preferência de tema salva prevalece; na ausência seguir sistema desde a primeira
pintura e mudanças posteriores. Manter seletor claro/escuro.
Preservar IDs de formulários, .msg-content, navegação, data-theme-btn/data-avatar-id.
Exportação frontend pode incluir socializacaoLocal identificado como dados do navegador.
Limpar dados locais após exclusão confirmada de conta/conversa; no logout limpar
memória e não exibir notas antes de identificar usuário novamente.

## Verificação e entrega
Commits separados de visual, navegação/formulários, socialização e testes.
Registrar resultados, capturas, seletores, instrução para desligar beta e pendências
com arquivo/linha no redesign-relatorio.md.
Executar pytest/Behave antes/depois somente com Python funcional e TEST_DATABASE_URL
separado; nunca banco de desenvolvimento. Baseline: Python do venv inacessível.
Estender testes browser: sugestões sem envio/rascunho, ensaio, passagem, notas,
armazenamento indisponível, troca de conta/exclusão, pausa com relógio simulado,
cancelamento/rede, beta desligado e fluxos existentes incluindo voz/esforço/exportação.
Capturar 360/768/1280px nos dois temas; proteger 320px. Conferir teclado, foco,
mensagens, contraste, zoom 200%, texto longo e movimento reduzido.
Teclado virtual real somente se houver dispositivo; emulação não comprova.
Auditar Web Interface Guidelines (Vercel), dando prioridade às decisões do projeto.

## Pendências backend — não implementar
Autoria histórica por mensagem; passagem por conteúdo emocional; garantias do ensaio;
cancelamento real no provedor; cadastro sem nome. Documentar localizações atuais.

