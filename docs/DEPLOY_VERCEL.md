# Deploy na Vercel

## 1) Pre-requisitos
- Repositorio no GitHub
- Projeto Supabase ativo
- Variaveis de ambiente do frontend em maos

## 2) Variaveis obrigatorias (Vercel)
Configurar em `Project Settings -> Environment Variables`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (ou `VITE_SUPABASE_PUBLISHABLE_KEY`)
- `VITE_PORT` (opcional, pode manter `8080`)

> Importante: segredos de Edge Function **nao** vao para a Vercel.
> Eles ficam no Supabase (Secrets), por exemplo:
> `USER_SESSION_JWT_SECRET`, `APP_RLS_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.

## 3) Build local (validacao)
```bash
npm ci
npm run build
```

## 4) Conectar e publicar
1. Importar o repo na Vercel
2. Framework: `Vite`
3. Build Command: `npm run build`
4. Output Directory: `dist`
5. Deploy

## 5) SPA Routing
O projeto usa `vercel.json` com rewrite para `index.html` (React Router).

## 6) PWA
- `sw.js` com `Cache-Control: no-cache` para evitar SW antigo preso em cache
- `manifest.webmanifest` com `Content-Type` correto

## 7) Checklist pos-deploy
- Login funcionando
- Troca de igreja funcionando
- Criar carta funcionando
- Notificacoes funcionando
- Pagina recarregando sem 404 em rotas internas
- PWA instalando e atualizando
