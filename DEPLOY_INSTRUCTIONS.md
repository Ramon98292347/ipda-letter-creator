# 🚀 Instruções de Deploy das Edge Functions

## Correções implementadas:
1. ✅ Notificações de aniversário para usuários com status PENDENTE
2. ✅ Logging melhorado do webhook N8N
3. ✅ Notificação ao usuário ao aprovar/rejeitar cadastro

---

## 📋 Pré-requisitos

### 1. Ter Supabase CLI instalado
```bash
npm list -g supabase
```

Se não tiver, instale:
```bash
npm install -g supabase
```

### 2. Estar autenticado no Supabase
```bash
supabase login
```

Será aberto um navegador para você autenticar com sua conta Supabase.

### 3. Saber seu Project ID
- Acesse https://app.supabase.com
- Selecione seu projeto
- Vá para **Settings → General**
- Copie o **Project ID** (ex: `abcdef1234567890`)

---

## 🎯 Opção 1: Deploy via NPM Script (Mais Fácil)

```bash
# 1. Navegar para a pasta do projeto
cd "c:/Users/ramon/OneDrive/Documentos/Ramon/Projeto trae/carta/ipda-letter-creator"

# 2. Executar o deploy
npm run deploy:functions
```

**Nota:** Este comando deploy ambas as functions:
- `notifications-api`
- `set-user-registration-status`

---

## 🎯 Opção 2: Deploy Manual via CLI

Se preferir fazer uma a uma ou com mais controle:

### Deploy da função notifications-api
```bash
cd "c:/Users/ramon/OneDrive/Documentos/Ramon/Projeto trae/carta/ipda-letter-creator"
supabase functions deploy notifications-api
```

### Deploy da função set-user-registration-status
```bash
supabase functions deploy set-user-registration-status
```

---

## 🎯 Opção 3: Via Supabase Dashboard (Zero CLI)

Se não tiver supabase CLI ou preferir não usar:

### Passo 1: Copiar o código
1. Abra [supabase/functions/notifications-api/index.ts](supabase/functions/notifications-api/index.ts) no editor
2. Selecione **todo** o conteúdo (Ctrl+A)
3. Copie (Ctrl+C)

### Passo 2: Upload no dashboard
1. Acesse https://app.supabase.com → seu projeto → **Functions**
2. Clique em `notifications-api`
3. Clique em "Deploy new version"
4. Cole o código
5. Clique em "Deploy"

### Passo 3: Repetir para a segunda função
1. Faça o mesmo para `supabase/functions/set-user-registration-status/index.ts`

---

## ✅ Validação Após Deploy

### Ver se o deploy foi bem-sucedido

```bash
# Listar funções do projeto
supabase functions list
```

Você deve ver:
```
notifications-api        (deployed)
set-user-registration-status (deployed)
```

### Verificar logs das funções

1. Acesse https://app.supabase.com → seu projeto → **Functions**
2. Clique em `notifications-api`
3. Vá para a aba **Logs**
4. Procure por `[birthday]` ou `[n8n]`

---

## 🔧 Troubleshooting

### Erro: "command not found: supabase"

**Solução:** Instale supabase CLI
```bash
npm install -g supabase
```

### Erro: "Not authenticated"

**Solução:** Faça login
```bash
supabase login
```

### Erro: "Project not found"

**Solução:** Verifique o Project ID no arquivo `.env` ou use:
```bash
supabase projects list
```

### Deploy demorou muito ou expirou

**Solução:** Tente novamente ou faça via Dashboard

### As funções foram deployed, mas as notificações ainda não funcionam

**Checklist:**

- [ ] Cron está agendado? (DATABASE → CRON → birthday-notify-daily)
- [ ] Há usuários com aniversário hoje? (Banco de dados)
- [ ] Há subscrições push ativas? (`push_subscriptions` com registros)
- [ ] Webhook N8N está ativo? (Teste manualmente: https://n8n-n8n.ynlng8.easypanel.host/webhook/senha)
- [ ] Logs mostram `[n8n] Erro`? Se sim, N8N está rejeitando. Verifique URL/payload.

---

## 📝 Próximos Passos

Após deploy bem-sucedido:

1. **Aguardar próximo aniversário** (ou testar manualmente)
2. **Monitorar logs** em Functions → Logs
3. **Testar aprovação de cadastro** criando um novo membro e aprovando
4. **Verificar notificações no banco**

---

## 📞 Teste Rápido (Manual)

Se não quiser esperar pelo cron (06:00):

### Via Insomnia/Postman/curl:

```bash
curl -X POST https://seu-projeto.supabase.co/functions/v1/notifications-api \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: [seu CRON_SECRET do .env]" \
  -d '{"action":"birthday"}'
```

**Resposta esperada:**
```json
{
  "ok": true,
  "churches": 2,
  "notifications": 5,
  "date": "2026-04-01"
}
```

---

## 💡 Dicas

- **Deploy rápido:** Use `npm run deploy:functions`
- **Ver progresso:** `supabase functions deploy notifications-api --verbose`
- **Sem perder código:** Sempre faça commit antes de deploy
- **Rollback fácil:** Se algo quebrar, faça `git revert [commit-hash]` e deploy novamente

---

**Pronto!** Execute o comando de deploy acima e você está feito! 🎉
