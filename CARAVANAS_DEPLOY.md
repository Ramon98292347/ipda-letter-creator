# Guia de Deploy: Gestão de Caravanas

## ✅ O que foi implementado

- ✅ Migração SQL para tabela `caravanas`
- ✅ Edge Function `caravanas-api` (4 actions: register, list, confirm, delete)
- ✅ Serviços no frontend (`registerCaravana`, `listCaravanas`, etc)
- ✅ Página pública: `/caravanas/registrar` (sem login)
- ✅ Página de gestão: `/caravanas` (admin/pastor/secretario)
- ✅ Item "Caravanas" no menu

## 🚀 Passos de Deploy

### 1. Executar a Migration

```bash
# No terminal na raiz do projeto
supabase db push
```

Isso criará a tabela `caravanas` no banco de dados Supabase.

### 2. Adicionar Variável de Ambiente

1. Vá para **Supabase Dashboard** → seu projeto
2. **Settings → Environment Variables** (ou Vault)
3. Adicione a variável:
   - **Name:** `CARAVANAS_WEBHOOK_URL`
   - **Value:** `https://n8n-n8n.ynlng8.easypanel.host/webhook/notificacao-caravanas`

### 3. Deploy da Edge Function

```bash
# Via CLI (recomendado)
supabase functions deploy caravanas-api

# Ou via npm script (após atualizar package.json)
npm run deploy:functions
```

Aguarde a mensagem de sucesso: `Function deployed successfully`

## 🧪 Testes

### Teste 1: Página Pública (Registro)

1. Acesse: `http://localhost:5173/caravanas/registrar` (sem login)
2. Preencha o formulário:
   - Igreja: selecione ou escolha "Outros"
   - Líder: nome qualquer
   - Placa: ABC-1234 ou ABC1D23
   - Passageiros: 45
   - WhatsApp: (11) 99999-9999
3. Clique em "Registrar Caravana"
4. **Esperado:** Mensagem de sucesso + webhook deve receber payload em `notificacao-caravanas`

### Teste 2: Página de Gestão (Admin)

1. Faça login com conta admin
2. No menu, clique em "Caravanas"
3. **Esperado:**
   - Stats cards: Recebidas, Confirmadas, Total de Passageiros
   - Filtros: Busca, Status
   - Tabela/cards com caravanas registradas

### Teste 3: Confirmar Caravana

1. Na página de gestão, clique em "Confirmar" em uma caravana "Recebida"
2. **Esperado:**
   - Status muda para "Confirmada" (verde)
   - Webhook recebe `action: "confirm"`

### Teste 4: Escopo de Pastor

1. Faça login com conta pastor
2. Na página `/caravanas`, deve ver **apenas as caravanas da sua jurisdição** (filtradas por `church_code`)
3. **Nota:** Se o pastor não tem nenhuma caravana em seu escopo, verá a mensagem "Nenhuma caravana registrada"

### Teste 5: Acesso Secretário

1. Faça login com role `secretario`
2. O item "Caravanas" deve aparecer no menu
3. Deve poder visualizar e confirmar caravanas

## 🔧 Troubleshooting

### Erro: "Function deployment failed"
- Verifique se a variável `CARAVANAS_WEBHOOK_URL` está configurada
- Tente fazer deploy novamente: `supabase functions deploy caravanas-api`

### Erro: "Unauthorized" ao registrar caravana
- A função usa `skipAuth: true` — deve funcionar sem token
- Verifique se há bloqueio de CORS

### Caravana não aparece na gestão
- Aguarde ~2 segundos (refetch a cada 30s)
- Atualize a página (F5)
- Verifique se a `church_code` está no escopo do pastor logado

### Webhook não recebe dados
- Verifique a URL: `https://n8n-n8n.ynlng8.easypanel.host/webhook/notificacao-caravanas`
- Teste a URL manualmente via curl:
  ```bash
  curl -X POST https://n8n-n8n.ynlng8.easypanel.host/webhook/notificacao-caravanas \
    -H "Content-Type: application/json" \
    -d '{"test": "payload"}'
  ```
- Veja os logs da Edge Function no Supabase Dashboard

## 📊 Estrutura de Dados

### Tabela `caravanas`
```
id (UUID)
church_code (TEXT) — código TOTVS da igreja
church_name (TEXT) — nome da igreja
city_state (TEXT) — cidade/estado
pastor_name (TEXT) — nome do pastor
vehicle_plate (TEXT) — placa do veículo
leader_name (TEXT) — nome do líder da caravana
leader_whatsapp (TEXT) — WhatsApp do líder
passenger_count (INTEGER) — quantidade de passageiros
status (TEXT) — 'Recebida' ou 'Confirmada'
created_at (TIMESTAMPTZ)
updated_at (TIMESTAMPTZ)
```

## 🔐 Segurança

- **Registro (público):** `register` não requer JWT, mas valida campos
- **Lista (autenticado):** Admin vê tudo; Pastor filtra por `church_code` no `session.totvs_access`
- **Confirmar:** Requer JWT; valida permissão por escopo
- **Deletar:** Apenas admin pode deletar

## 📱 Responsividade

- **Desktop:** Tabela horizontal com 6 colunas
- **Mobile:** Cards verticais com resume das informações

## 🎨 Design

- Segue estilo do `ipda-letter-creator` (cards, slot/sky colors)
- Ícone Bus (lucide-react) no menu
- Buttons com estados de loading

---

**Status:** ✅ Pronto para deploy em Supabase.
