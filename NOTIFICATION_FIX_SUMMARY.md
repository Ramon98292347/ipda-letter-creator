# Correção do Sistema de Notificações

**Data:** 2026-04-01  
**Status:** ✅ Implementado e commitado  
**Deploy necessário:** SIM - Edge Functions precisam ser atualizadas no Supabase

---

## 🐛 Problemas Corrigidos

### Problema 1: Aniversariantes com status PENDENTE não recebem notificação ❌→✅

**Causa raiz:**
- A query em `notifications-api/actionBirthday()` linha 317 filtrava `.eq("is_active", true)`
- Quando um novo cadastro é feito com status PENDENTE, o `is_active` é definido como `false`
- Resultado: Aniversariantes pendentes **não aparecem** na busca, logo **não recebem notificação**

**Solução implementada:**
```typescript
// ANTES:
const { data: users, error } = await sb
  .from("users")
  .select("id, full_name, phone, email, birth_date, default_totvs_id")
  .eq("is_active", true)
  .not("birth_date", "is", null);

// DEPOIS:
const { data: users, error } = await sb
  .from("users")
  .select("id, full_name, phone, email, birth_date, default_totvs_id")
  .not("birth_date", "is", null);
// Removido: .eq("is_active", true)
```

**Impacto:** Agora todos os membros com data de nascimento recebem notificação, independente do status de registro.

---

### Problema 2: Webhook N8N falhando silenciosamente ❌→✅

**Causa raiz:**
- O fetch para o webhook N8N não verificava `response.ok`
- Se o N8N retornasse erro (4xx/5xx), o código não logava isso
- Resultado: **Ninguém sabe** se a mensagem chegou no celular do pastor

**Solução implementada:**
```typescript
// ANTES:
try {
  await fetch("https://n8n-n8n.ynlng8.easypanel.host/webhook/senha", {
    // ...
  });
} catch (err) {
  console.error("[n8n] Erro webhook aniversário:", err);
}

// DEPOIS:
const response = await fetch(webhookUrl, {
  // ...
});

if (!response.ok) {
  const text = await response.text();
  console.error(
    `[n8n] Erro webhook aniversário (${b.full_name}): HTTP ${response.status} ${response.statusText}. Response: ${text}`
  );
} else {
  console.log(`[n8n] Webhook enviado com sucesso para ${b.full_name} (telefone: ${b.phone})`);
}
```

**Impacto:** Agora há visibilidade clara se o webhook falha. Consulte os logs do Supabase para diagnosticar problemas.

---

### Problema 3: Usuário não recebe feedback ao aprovar/rejeitar cadastro ❌→✅

**Causa raiz:**
- `set-user-registration-status` atualizava o status no banco mas **não notificava o usuário**
- Resultado: Usuário só descobria a rejeição ao tentar logar

**Solução implementada:**

1. **Notificação interna no banco:**
```typescript
await sb.from("notifications").insert({
  user_id: userId,
  church_totvs_id: targetTotvs,
  type: "registration_status",
  title: status === "APROVADO" ? "Cadastro Aprovado! ✅" : "Cadastro Pendente ⏳",
  message: status === "APROVADO" 
    ? "Parabéns! Seu cadastro foi aprovado..."
    : "Seu cadastro está aguardando aprovação...",
  read_at: null,
});
```

2. **Push notification imediata:**
```typescript
const pushSent = await sendInternalPushNotification({
  title: notificationTitle,
  body: notificationMsg,
  url: "/",
  user_ids: [userId],
});
```

**Impacto:** Usuário agora recebe notificação **imediata** no celular ao ser aprovado ou rejeitado.

---

## 📋 Arquivos Modificados

### `supabase/functions/notifications-api/index.ts`
- **Linhas alteradas:** 314-318 (query de aniversariantes) + 388-417 (webhook N8N)
- **Alterações:** 
  - Removido `.eq("is_active", true)` da busca de usuários
  - Adicionado check de `response.ok` no fetch do webhook
  - Log melhorado com HTTP status code e telefone do aniversariante

### `supabase/functions/set-user-registration-status/index.ts`
- **Linhas alteradas:** 1-21 (imports) + 213-244 (após update)
- **Alterações:**
  - Adicionado import de `sendInternalPushNotification`
  - Inserção de notificação interna ao aprovar/rejeitar
  - Envio de push notification via função centralizada

---

## 🚀 Deploy das Edge Functions

Você **precisa fazer deploy** das funções atualizadas no Supabase. Existem 2 opções:

### Opção 1: Via Supabase CLI (Recomendado)

```bash
# Navegar para a pasta do projeto
cd "c:/Users/ramon/OneDrive/Documentos/Ramon/Projeto trae/carta/ipda-letter-creator"

# Fazer deploy das funções atualizadas
supabase functions deploy notifications-api --project-id seu-project-id
supabase functions deploy set-user-registration-status --project-id seu-project-id
```

**Nota:** Você precisa ter:
- Supabase CLI instalado (`npm install -g supabase`)
- Estar autenticado (`supabase login`)
- Saber seu Project ID (encontra em Project Settings → General)

### Opção 2: Via Supabase Dashboard (Manual)

1. Acesse https://app.supabase.com
2. Selecione seu projeto
3. Vá para **Functions**
4. Para cada function (`notifications-api`, `set-user-registration-status`):
   - Clique em "Deploy new version"
   - Cole o código do arquivo `.ts` correspondente
   - Clique em "Deploy"

---

## ✅ Verificação Após Deploy

### 1. Testar notificação de aniversário com status PENDENTE

```bash
# Criar um novo usuário com status PENDENTE
# ... (via dashboard ou API)

# Adicionar data de nascimento = HOJE

# Esperar 06:00 (São Paulo) ou disparar manualmente:
# POST https://seu-projeto.supabase.co/functions/v1/notifications-api
# Headers:
#   x-cron-secret: [seu CRON_SECRET]
#   Content-Type: application/json
# Body: { "action": "birthday" }

# Verificar se recebeu notificação no banco:
# SELECT * FROM notifications WHERE user_id = '[id do usuário]' AND type = 'birthday'
```

### 2. Testar aprovação/rejeição de cadastro

```bash
# Criar um novo cadastro via public-register-member
# ... (via formulário público)

# Aprovar o cadastro:
# POST https://seu-projeto.supabase.co/functions/v1/set-user-registration-status
# Headers:
#   Authorization: Bearer [JWT do admin/pastor]
#   Content-Type: application/json
# Body: { "user_id": "[id do novo usuário]", "registration_status": "APROVADO" }

# Verificar notificações:
# SELECT * FROM notifications WHERE user_id = '[id]' AND type = 'registration_status'

# Verificar push (se configurado):
# SELECT * FROM push_subscriptions WHERE user_id = '[id]'
```

### 3. Monitorar logs do webhook N8N

No Supabase Dashboard:
1. Vá para **Functions**
2. Clique em `notifications-api`
3. Vá para **Logs**
4. Procure por `[n8n]` para ver status dos webhooks
5. Erros mostraráo: `[n8n] Erro webhook aniversário (João Silva): HTTP 500 Internal Server Error`

---

## 📝 Notas Importantes

### Fuso Horário

O cron de aniversário roda às **06:00 Brasília** (09:00 UTC):
```
Cron: '0 9 * * *'
= 09:00 UTC = 06:00 São Paulo (UTC-3)
```

⚠️ **Em período de verão** (out/mar), São Paulo é UTC-2, então pode disparar 1 hora adiantado. Se quiser ajustar automaticamente, use:
```sql
SELECT cron.schedule(
  'birthday-notify-daily',
  '0 6 * * *',
  $$ ... $$
  -- Usar horário direto de São Paulo ao invés de UTC
);
```

### N8N Webhook

A URL do webhook é:
```
https://n8n-n8n.ynlng8.easypanel.host/webhook/senha
```

Se o N8N mudar de URL, atualize em `notifications-api/index.ts` linha 390.

### Limites de Push

- Push é enviado apenas para usuários com subscrição ativa em `push_subscriptions`
- Se o usuário não abriu o app ou rejeitou push, não receberá
- Notificação interna no banco **sempre** é criada (como fallback)

---

## 🎯 Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Aniversário com status PENDENTE | ❌ Sem notificação | ✅ Recebe notificação |
| Webhook N8N falha | ❌ Erro invisível | ✅ Erro visível nos logs |
| Cadastro aprovado | ❌ Usuário não sabe | ✅ Recebe push + notificação |
| Cadastro rejeitado | ❌ Usuário descobre ao logar | ✅ Recebe notificação imediata |

---

## 📞 Debug

Se algo ainda não funcionar:

1. **Verificar se cron rodasva:** 
   - Supabase Dashboard → Database → Cron Jobs
   - Procure por `birthday-notify-daily`
   - Verifique `last_run_time`

2. **Verificar logs das functions:**
   - Supabase Dashboard → Functions → Logs
   - Procure por `[birthday]`, `[n8n]`, `[set-user-registration-status]`

3. **Verificar banco de dados:**
   ```sql
   -- Ver notificações criadas
   SELECT * FROM notifications WHERE type = 'birthday' ORDER BY created_at DESC LIMIT 10;
   
   -- Ver subscrições push
   SELECT COUNT(*) as total_subscriptions FROM push_subscriptions;
   
   -- Ver status de registros
   SELECT id, full_name, is_active, totvs_access FROM users LIMIT 5;
   ```

4. **Testar webhook N8N manualmente:**
   ```bash
   curl -X POST https://n8n-n8n.ynlng8.easypanel.host/webhook/senha \
     -H "Content-Type: application/json" \
     -d '{"event":"birthday","nome":"Teste","telefone":"11999999999"}'
   ```

---

**Status:** Pronto para deploy ✅
