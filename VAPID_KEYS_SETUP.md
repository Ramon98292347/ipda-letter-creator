# Configuração das Chaves VAPID para Push Notifications

## 🔐 Chaves Geradas

```
Public Key:
BPjB7Z77SSXtXOn2i2Cf1BjoStG0rzXf6_xb4oTBVyoyaF6udxa20x677X99L99Sqtj3tE_2wusQ9MhhdBkkskg

Private Key:
pyf0t3rYDv98Fja0GqL5SJ3sGNjLbq0K0Q1mjG75QHE
```

## ✅ O que foi feito

1. ✅ **Chave pública atualizada** em `src/hooks/usePushNotifications.ts`
2. ⏳ **Chave privada** precisa ser configurada no Supabase (próximo passo)

## 🚀 Configurar no Supabase

### Passo 1: Acesse o Supabase
1. Vá para https://app.supabase.com
2. Selecione seu projeto
3. Vá para **Settings → Edge Functions**

### Passo 2: Configure as variáveis de ambiente

Você precisa adicionar 2 variáveis em **Settings → Environment Variables**:

#### Variável 1: VAPID_PUBLIC_KEY
```
Name: VAPID_PUBLIC_KEY
Value: BPjB7Z77SSXtXOn2i2Cf1BjoStG0rzXf6_xb4oTBVyoyaF6udxa20x677X99L99Sqtj3tE_2wusQ9MhhdBkkskg
```

#### Variável 2: VAPID_PRIVATE_KEY
```
Name: VAPID_PRIVATE_KEY
Value: pyf0t3rYDv98Fja0GqL5SJ3sGNjLbq0K0Q1mjG75QHE
```

### Passo 3: Deploy das functions

Após configurar as variáveis, faça o deploy das functions que usam as chaves:

```bash
supabase functions deploy notifications-api
```

Ou use o npm script:
```bash
npm run deploy:functions
```

---

## ✅ Verificação

### Testar se funciona:

1. **No app:** Clique em "Ativar notificacoes" (Desktop) ou "Ligar Alertas" (Celular)
2. **Navegador:** Deve pedir permissão
3. **Se aceitar:**
   - ✅ Subscription é salva no banco (`push_subscriptions`)
   - ✅ Notificações começam a funcionar
   - ✅ Mensagem de sucesso no app

4. **Se não funcionar:**
   - Verifique os logs no Supabase → Functions → Logs
   - Procure por erro `vapid_keys_not_configured` (variáveis não foram definidas)
   - Procure por `error: 400` ou `error: 500` (erro ao enviar push)

---

## 📋 Arquivo de Configuração

A seguinte função valida as chaves:

**File:** `supabase/functions/notifications-api/index.ts` (linhas 226-231)
```typescript
const vapidPublic = String(Deno.env.get("VAPID_PUBLIC_KEY") || "").trim();
const vapidPrivate = String(Deno.env.get("VAPID_PRIVATE_KEY") || "").trim();
if (!vapidPublic || !vapidPrivate) {
  return json({ ok: false, error: "vapid_keys_not_configured" }, 500);
}
```

---

## 🔄 Regenerar Chaves (Se Necessário)

Se precisar gerar novo par de chaves VAPID:

```bash
npx web-push generate-vapid-keys
```

Depois:
1. Atualize em `src/hooks/usePushNotifications.ts` (chave pública)
2. Atualize no Supabase (ambas as chaves)
3. Deploy das functions

---

## 📱 Comportamento Esperado por Dispositivo

### Desktop (Chrome, Edge, Firefox)
- ✅ Botão "Ativar notificacoes" visível
- ✅ Solicita permissão do navegador
- ✅ Salva subscription no banco
- ✅ Recebe notificações push

### Celular (Android Chrome)
- ✅ Botão "Ligar Alertas" visível (se PWA instalada)
- ✅ Solicita permissão do navegador
- ✅ Salva subscription no banco
- ✅ Recebe notificações push

### iOS (Safari)
- ❌ Sem suporte a Push Notifications
- ❌ Botão não aparece
- ℹ️ Apple não permite push em PWA no iOS

---

**Status:** ✅ Chaves geradas e código atualizado. Aguardando configuração no Supabase.
