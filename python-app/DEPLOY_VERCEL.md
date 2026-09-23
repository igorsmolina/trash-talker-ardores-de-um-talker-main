# Publicação na Vercel

O diretório de publicação deste projeto é `python-app/`. Ao importar o
repositório na Vercel, defina **Root Directory** como `python-app` e mantenha
as configurações de build em branco. A Vercel detecta `app.py` como aplicação
Flask e publica `public/` como arquivos estáticos na CDN.

## Rotas publicadas

| URL | Arquivo servido |
| --- | --- |
| `/` | `public/index.html` |
| `/login` | `public/login.html` |
| `/signup` | `public/signup.html` |
| `/forgot-password` | `public/forgot-password.html` |
| `/reset-password` | `public/reset-password.html` |
| `/privacy` | `public/privacy.html` |
| `/terms` | `public/terms.html` |
| `/dashboard` | `public/dashboard.html` |
| `/dashboard/account` | `public/account.html` |
| `/dashboard/settings` | `public/settings.html` |
| `/dashboard/chat/:chatId` | `public/chat.html` |

`/dashboard/information` é uma rota legada e redireciona para `/`.
As rotas acima são *rewrites*: a aba continua exibindo a URL limpa, sem
`.html`. As chamadas `/api/*` são atendidas pela aplicação Flask.

## Variáveis de ambiente

Cadastre em **Settings > Environment Variables** para Preview e Production:

- `DATABASE_URL` — obrigatório; URL de conexão do PostgreSQL.
- `GEMINI_API_KEY` — necessário para o envio de mensagens à IA.
- `FLASK_ENV=production` — habilita o cookie de sessão seguro.
- `FRONTEND_ORIGIN=https://seu-dominio.vercel.app` — origem pública da
  aplicação; substitua pelo domínio final.

Se a recuperação de senha for usada em produção, inclua também `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` e `SMTP_FROM`.

Nunca envie um arquivo `.env` ao repositório ou à Vercel. Depois de cadastrar
as variáveis, faça um deploy de Preview e valide as URLs da tabela antes de
promover para Production.
