# Redesign Open Conversation — setembro de 2026

O redesign mantém a aplicação multipágina em HTML/CSS/JavaScript e todas
as rotas, textos, campos, ações e chamadas de API existentes. A entrada
principal continua sendo a primeira mensagem; o perfil não é obrigatório.

## Arquivos principais

- `frontend/css/redesign.css`: sistema visual novo, carregado depois da
  base funcional `app.css` nas 11 páginas. Redefine paleta, tipografia,
  disposição e aparência dos componentes.
- `frontend/index.html`: home assimétrica, com título e ações à esquerda,
  ilustração à direita e instruções em linhas numeradas.
- `frontend/logo-talker.svg`: logo original restaurada na navegação,
  autenticação, carregamento e favicon. O arquivo original não foi alterado.
- `frontend/conversation-art.svg`: ilustração vetorial local, sem texto,
  compartilhada pela home e pelo painel de autenticação no tema escuro.
- `frontend/conversation-art-light.svg`: versão para o painel claro
  de autenticação, com amarelo da logo, pêssego e traços marrons.
- `frontend/conversation-art-home-light.svg`: variante da home com o
  amarelo exato da logo; a versão escura permanece inalterada.
- `frontend/js/ui.js`: nomes acessíveis, mensagens de estado e associações
  entre campos e suas instruções existentes.
- `frontend/js/layout.js`: gaveta mobile com fundo escurecido, Escape e
  controle de foco; recolhimento persistente independente no desktop.
- `frontend/js/modal.js`: confirmação e renomeação com contenção e retorno
  de foco; proteção contra confirmação repetida durante uma requisição.
- `frontend/js/personality-picker.js`: menu operável por setas, Home, End,
  Enter, Tab e Escape, sem opções fechadas na ordem de foco.
- `frontend/js/chat.js`: campo expansível, controles em faixa separada,
  respeito a movimento reduzido e preservação do ícone no histórico após envio.

## Direção visual

A paleta original foi restaurada, preservando o fundo claro desta versão
`#f4f5ef` e as superfícies brancas `#ffffff`. As ações e ilustrações claras
usam `#f7d834`, extraído da logo original; o tema escuro usa fundo `#2a221f`, superfícies `#332b27` e ações
laranja `#eb6a40`. A ilustração também usa dourado e laranja. No tema claro,
superfícies secundárias `#ede9dd`, áreas suaves `#eeede6`, navegação `#efeee7`
e divisórias `#dedbd0` aproximam os detalhes do fundo off-white. Os demais
tokens vêm de `app.css`, com tons de texto da própria paleta aplicados
aos botões e às bordas de campo para manter contraste. O tema escolhido
continua persistido em localStorage.

Os títulos usam Arial com espaçamento compacto; a frase principal combina
sans-serif e Georgia em itálico. Os textos usam Segoe UI com fallback Arial,
e os rótulos de seção usam Consolas. Nenhuma fonte ou imagem depende de CDN.

Botões usam cantos de 12 px e ícones em encaixes fixos. O composer tem
cantos de aproximadamente 18 px, com texto e controles em linhas separadas.
A navegação ocupa uma faixa contínua; configurações usam divisórias em vez
de cartões empilhados. A área de perfil destaca a escolha de avatar.
As respostas da IA agora têm caixa própria com fundo de superfície, borda,
cantos arredondados e espaçamento interno. O botão de ouvir continua logo
abaixo da resposta, e o conteúdo permanece selecionável, sem ser editável.

A autenticação tem um painel ilustrado em telas a partir de 1024 px.
O fundo e a imagem desse painel acompanham a classe `html.dark`, usando
as variáveis `--auth-art-background` e `--auth-art-image`. A escolha salva
em localStorage é aplicada antes do desenho da página; `setTheme` também
atualiza o painel imediatamente, sem recarregar. O tema claro tem fundo
`#edece3`; o escuro mantém a imagem e o fundo anteriores.
Em telas menores, o formulário ocupa a coluna disponível. A home passa
de uma para duas colunas a partir de 640 px. Animações de hover são curtas
e desativadas quando o usuário solicita movimento reduzido.

A skill System Design indicada é um template de documento Word, não de
interface. O template foi inspecionado, mas sua entrega DOCX foi interrompida:
o ambiente não possui LibreOffice para a renderização/verificação obrigatória.
O documento de referência foi mantido intacto. Este registro descreve
a implementação do site, sem alegar reprodução do template em Markdown.

As ações Renomear e Excluir permanecem diretamente acessíveis junto de
cada conversa na barra lateral expandida, inclusive por toque.

Textos e ícones de navegação compartilham os mesmos recuos e tamanhos de
encaixe. Imagens usam caixas sem espaço de linha extra; os avatares ficam
em uma grade regular. A coluna de mensagens e o composer têm o mesmo eixo.

As regras de senha começam ocultas no cadastro, na redefinição e na troca
de senha. Aparecem durante o foco no campo de senha (clique, toque ou teclado)
e somem ao sair dele. Em formulários com duas colunas, ocupam uma linha
inteira abaixo dos dois campos. Os textos das regras e a validação continuam
iguais; o campo referencia a lista por `aria-describedby`.

## Verificação reproduzível

Com Node.js e Playwright disponíveis:

```powershell
# Use PW_CHANNEL caso não haja Chromium do Playwright instalado.
$env:PW_CHANNEL = 'msedge'
node tools/redesign-smoke.cjs
```

O script cria um servidor temporário em loopback e fecha servidor e navegador
ao terminar. As APIs são simuladas: ele não consulta o banco, não chama IA,
não envia e-mails e não altera contas reais. Se Playwright estiver em um
runtime externo, configure `NODE_PATH` para sua pasta `node_modules`.

São verificadas as 11 páginas em 320, 390, 768, 1024 e 1440 px, nos dois temas, além da
gaveta em 900 px, teclado, menus, envio/parada de mensagem, renomeação,
cancelamento de exclusão, avatar/interesses, persistência de tema,
exportação e criação de conversa pela primeira mensagem.
Também são conferidos o carregamento de imagens, os alinhamentos do chat e dos ícones de navegação,
os estados de foco das regras de senha nos dois temas/larguras e a rejeição
de senha fraca antes de qualquer envio à API simulada.
O favicon original e a caixa da resposta da IA também são verificados,
incluindo fundo, borda, preenchimento interno e ausência de transbordamento.
Login e cadastro têm verificações da versão da ilustração, cor do painel,
carregamento do SVG, troca imediata de tema e persistência entre páginas.
O teste exige contraste de pelo menos 4,5:1 para os pares de tokens de texto
e botões verificados, e 3:1 para a borda do campo em relação à superfície.

Para comparar textos, placeholders, IDs e links com uma cópia anterior,
aponte `REDESIGN_BASELINE` para a pasta frontend original antes de executar.
As capturas em `artifacts/redesign/` usam dados fictícios de teste.

Essas verificações não substituem testes de integração com um banco de
teste configurado, resposta real da IA, microfone/voz real ou leitor de tela.
O teste adicional das rotas Flask não pôde ser executado: o ambiente virtual
local aponta para um Python indisponível, e o runtime alternativo não tem
as dependências compatíveis do backend. Nenhuma dependência foi instalada
ou alterada durante este redesign.
