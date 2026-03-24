# SISTEMA.md — Referência Completa do Sistema de Gestão Eclesiástica IPDA

> Arquivo gerado para uso de referência rápida. Atualizar sempre que houver mudança arquitetural.

---

## 1. Visão Geral

Sistema web para igrejas da **IPDA (Igreja Pentecostal Deus é Amor)** gerenciarem:
- Cartas de recomendação/transferência de obreiros e membros
- Cadastro e gestão de obreiros, pastores e igrejas
- Divulgações e anúncios para a congregação
- Documentos: ficha de membro, carteirinha

---

## 2. Stack de Tecnologia

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS |
| Estado | React Query (@tanstack/react-query) + React Context |
| Backend | Supabase Edge Functions (Deno/TypeScript) |
| Banco de dados | PostgreSQL no Supabase |
| Storage | Supabase Storage (buckets: `cartas`, `avatars`, `announcements`) |
| Automação PDF | n8n (webhook → gera PDF → salva no Storage) |
| Deploy | Vercel (frontend) |

---

## 3. Autenticação — REGRA CRÍTICA

### Dois tokens diferentes — nunca confundir

| Token | Variável | Finalidade |
|-------|----------|-----------|
| `ipda_token` | `TOKEN_KEY` | JWT customizado assinado com `USER_SESSION_JWT_SECRET`. Enviado em `Authorization: Bearer` para **Edge Functions**. |
| `ipda_rls_token` | `RLS_TOKEN_KEY` | Token legado para queries diretas no Supabase. **NÃO FUNCIONA** — o PostgREST do Supabase exige JWT assinado com o segredo nativo do Supabase, não com `USER_SESSION_JWT_SECRET`. |

### Regra: NUNCA usar queries diretas Supabase com `getRlsToken()`

```ts
// ❌ ERRADO — causa 401 no console
if (supabase && getRlsToken()) {
  const { data } = await supabase.from("users").select("*");
}

// ✅ CORRETO — usa edge function com JWT correto
const data = await api.listMembers({ ... });
```

Todos os `if (supabase && getRlsToken())` no `saasService.ts` foram desativados com `false &&`.

### Dois clientes Supabase

```ts
// supabase.ts
export const supabase      // injeta rls_token (QUEBRADO — não usar para queries privadas)
export const supabaseAnon  // cliente limpo com anon key (usar para dados públicos)
```

---

## 4. Como Fazer Chamadas à API

**Todas as operações autenticadas usam Edge Functions via `api.*()` em `endpoints.ts`.**

```ts
// endpoints.ts — a função post() em api.ts envia automaticamente o Bearer token
import { api } from "@/lib/endpoints";

// Exemplos:
await api.listMembers({ search: "João", page: 1, page_size: 20 });
await api.createLetter({ ... });
await api.listNotifications({ page: 1, page_size: 20 });
```

A função `post()` em `src/lib/api.ts`:
1. Lê o token de `localStorage` via `getToken()`
2. Valida se é um JWT válido (tem `sub`, `role`, `active_totvs_id`)
3. Envia `Authorization: Bearer <token>` + `apikey: <SUPABASE_ANON_KEY>`
4. Se `missing_token` → faz logout automático

---

## 4.1 Grouped APIs

O sistema está sendo consolidado por grupos para facilitar manutenção e reduzir functions soltas.

Grouped APIs já usadas no projeto:
- `letters-api`
- `meetings-api`
- `notifications-api`
- `members-api`
- `churches-api`
- `announcements-api`
- `church-docs-api`
- `auth-api`

Regra de compatibilidade:
- manter as functions antigas enquanto o frontend migra
- novas telas e ajustes devem priorizar as grouped APIs
- todas devem usar `verify_jwt = false` e validar o JWT customizado manualmente quando necessário

---

## 5. Papéis (Roles)

| Role | Acesso | Rota inicial |
|------|--------|-------------|
| `admin` | Tudo — gerencia todas as igrejas do escopo | `/admin/dashboard` |
| `pastor` | Sua igreja — cria cartas, aprova obreiros | `/pastor/dashboard` |
| `obreiro` | Apenas seus documentos e dados | `/obreiro` |

---

## 6. Tabelas Principais do Banco

### `users`
```
id, full_name, role (admin/pastor/obreiro), cpf, rg, phone, email
minister_role, profession, birth_date, baptism_date, marital_status
matricula, ordination_date, avatar_url, signature_url
cep, address_street, address_number, address_complement
address_neighborhood, address_city, address_state
default_totvs_id, totvs_access (array), is_active
can_create_released_letter, registration_status, payment_status
payment_block_reason, password_hash
discipline_status, discipline_block_reason
discipline_blocked_at, discipline_unblocked_at, discipline_updated_by
```

> **ATENÇÃO:** O endereço está em colunas planas (`address_street`, `cep` etc.).
> NÃO existe campo `address_json` na tabela users.

### `churches`
```
totvs_id (PK), parent_totvs_id, church_name, class
image_url, stamp_church_url, contact_email, contact_phone
cep, address_street, address_number, address_complement
address_neighborhood, address_city, address_state, address_country
is_active, pastor_user_id
```

### `letters`
```
id, user_id, church_totvs_id, type, status, storage_path
created_at, updated_at, released_at, sent_at
```

**Status de carta:**
- `AUTORIZADO` → PDF sendo gerado pelo n8n
- `BLOQUEADO` → não pode ser usado
- `AGUARDANDO_LIBERACAO` → obreiro pediu liberação
- `LIBERADA` → pastor aprovou, obreiro pode baixar
- `ENVIADA` → carta enviada ao destino
- `EXCLUIDA` → soft delete

### `notifications`
```
id, church_totvs_id, user_id, title, message, type
is_read, read_at, created_at
```

### `ministerial_meeting_attendance`
```
id, meeting_date, church_totvs_id, user_id
status (PRESENTE/FALTA/FALTA_JUSTIFICADA)
justification_text, blocked_on_save, marked_by
created_at, updated_at
```

Regra:
- 3 faltas sem justificativa em 180 dias
- bloqueio automatico em `users.is_active = false`
- marca tambem `discipline_status = BLOQUEADO_DISCIPLINA`

### `announcements`
```
id, church_totvs_id, title, type (text/image/video)
body_text, media_url, link_url, position
starts_at, ends_at, is_active, created_at
```

---

## 7. Edge Functions — Configuração

**CRÍTICO:** Todas as edge functions que recebem nosso JWT customizado precisam ter `verify_jwt = false` no Supabase, caso contrário o Supabase valida o JWT com o segredo nativo e rejeita com 401.

### Configurar no `supabase/config.toml`:
```toml
[functions.nome-da-function]
verify_jwt = false
```

### Funções que PRECISAM de `verify_jwt = false` (usam JWT customizado):
- `list-notifications`
- `mark-notification-read` ⚠️ (ainda gerando 401 — aguardando configuração)
- `mark-all-notifications-read` ⚠️ (ainda gerando 401 — aguardando configuração)
- Todas as demais funções autenticadas
- `save-ministerial-attendance`

### Funções públicas (sem JWT):
- `forgot-password-request`
- `reset-password-confirm`
- `public-register-member`
- `login`
- `select-church`

---

## 8. Fluxo de Emissão de Carta

```
1. Pastor/Admin preenche formulário
2. Front → POST edge function create-letter
3. create-letter salva em letters (status=AUTORIZADO, storage_path=null)
4. create-letter dispara webhook do n8n
5. n8n gera PDF → salva no Storage (bucket: cartas)
6. n8n → POST letter-finish (com x-n8n-key) → atualiza storage_path
7. Pastor visualiza carta e libera (set-letter-status → LIBERADA)
8. Obreiro baixa via get-letter-pdf-url (URL assinada temporária)
```

> **Regra do n8n:** O webhook do n8n NÃO deve ser alterado. O fluxo de geração de PDF é mantido como está.

### Regra dos dados ministeriais na carta
- a carta usa `users.ordination_date` como data ministerial principal
- se `ordination_date` estiver vazia, usa `users.baptism_date`
- o status de cadastro do usuário não vem de coluna `users.registration_status`
- o status é resolvido pelo `totvs_access[].registration_status`, priorizando a igreja da carta

### Regra atual de origem/destino na `letters-api`
- `Outros` pode ser enviado sem TOTVS quando `manual_destination=true`
- para pastor/admin, a origem aceita a igreja ativa e as igrejas mãe da árvore
- para obreiro, a tela pode subir a origem para a igreja mãe conforme a hierarquia
- para compatibilidade com os dois frontends, `letters-api` também aceita `action: "manage"` com `manage_action`

---

## 9. Hierarquia de Igrejas (Totvs)

- Cada igreja tem um `totvs_id` único
- Igreja pode ter `parent_totvs_id` (hierarquia)
- `root_totvs_id` = totvs da igreja raiz (mãe) da hierarquia
- Admin tem acesso a um `scope_totvs_ids` (array de todas as igrejas sob seu controle)
- Divulgações mostram a da `root_totvs_id` e da igreja ativa

---

## 10. Sessão do Usuário (localStorage)

| Chave | Conteúdo |
|-------|---------|
| `ipda_token` | JWT customizado (Bearer para edge functions) |
| `ipda_rls_token` | Token legado (não funcional para queries diretas) |
| `ipda_session` | `{ totvs_id, root_totvs_id, role, church_name, church_class, scope_totvs_ids }` |
| `ipda_user` | `{ id, full_name, cpf, role }` |

---

## 10.1 Atualizacoes Recentes

### Cartas
- o botao `Excluir` remove a carta fisicamente do banco
- antes da exclusao, o backend limpa relacoes basicas como `release_requests` e notificacoes com `related_id`
- as listas de cartas mostram inicialmente apenas as 5 mais novas
- quando houver mais registros, a interface mostra um botao para expandir

### Notificacoes
- ao marcar como lida, a notificacao e removida do banco
- notificacoes duplicadas do mesmo evento de carta sao tratadas juntas para nao reaparecerem
- o push web depende da tabela `push_subscriptions` com `user_id` e `totvs_id` corretos

### Members API
- o frontend principal ja usa `members-api` para `list-members` e `list-workers`
- a function agrupada tambem concentra `save`, `save-profile`, `get-profile`, `upload-photo`, `update-avatar` e `upsert-stamps`
- depois do deploy dessa etapa, `list-members` e `list-workers` legadas viram candidatas a exclusao

### Announcements API
- o frontend principal ja esta consolidado em `announcements-api`
- as actions em uso sao `list`, `upsert` e `delete`
- a grouped API agora tambem aceita conteudo legado de `events` e `banners` via encaminhamento interno
- actions preparadas: `list-public`, `list-admin`, `list-events`, `upsert-event`, `delete-event`, `list-events-public`, `list-banners`, `upsert-banner`, `delete-banner`, `list-banners-public`
- as legadas `list-announcements`, `upsert-announcement`, `delete-announcement`, `list-events`, `upsert-event`, `delete-event`, `list-banners` e semelhantes podem ser avaliadas para remocao depois da validacao final

### Churches API
- o frontend principal agora usa `churches-api` para listar igrejas, criar, excluir e definir pastor
- nesta etapa a grouped API encaminha para as functions legadas por baixo, preservando a regra atual
- depois da validacao, `list-churches-in-scope`, `create-church`, `delete-church`, `set-church-pastor` e `list-pastors` podem entrar na fila de remocao

### Member Docs API
- o frontend principal agora usa `member-docs-api` para gerar documentos e consultar status
- as actions em uso sao `generate` e `status`
- a action `finish` ficou preparada para consolidar o callback do n8n no mesmo grupo
| `ipda_last_totvs` | Último totvs_id do usuário logado |
| `ipda_root_totvs` | Totvs da igreja raiz (para divulgações na tela de login) |

---

## 11. Estrutura do Frontend

```
src/
├── components/
│   ├── shared/        # Componentes reutilizáveis (AnnouncementCarousel, etc.)
│   └── ui/            # shadcn/ui components
├── context/
│   └── UserContext.tsx  # Estado global do usuário logado
├── lib/
│   ├── api.ts         # post(), getToken(), getSession() etc.
│   ├── endpoints.ts   # Todos os endpoints da API (api.*)
│   └── supabase.ts    # Clientes Supabase (supabase + supabaseAnon)
├── pages/
│   ├── PhoneIdentify.tsx    # Tela de login
│   ├── UsuarioDashboard.tsx # Dashboard do obreiro
│   ├── UsuarioDocumentosPage.tsx # Ficha de membro e documentos
│   └── admin/pastor/...     # Páginas por papel
└── services/
    └── saasService.ts  # Todas as chamadas de dados (usa api.* endpoints)
```

---

## 12. Padrões de Código Importantes

### Leitura de endereço (CORRETO)
```ts
// Os campos de endereço estão em colunas planas, NÃO em address_json
const profileRaw = profile as Record<string, unknown> | undefined;
const street = String(profileRaw?.address_street || "");
const cep = String(profileRaw?.cep || "");
```

### Dados extras do usuário (spread para preservar campos)
```ts
// mapUserLike() só retorna campos do tipo AuthSessionData.
// Usar spread para preservar campos extras (rg, baptism_date, cep etc.)
user: userRaw ? {
  ...(userRaw as Record<string, unknown>),
  ...mapUserLike(userRaw as Record<string, unknown>)
} as AuthSessionData : null,
```

---

## 13. Presenca Ministerial

Tela:
- rota `/presenca`
- acesso para `admin`, `pastor` e `secretario`

Arquivos principais:
- `src/pages/PresencaMinisterialPage.tsx`
- `supabase/functions/save-ministerial-attendance/index.ts`
- `supabase/migrations/20260322_ministerial_attendance.sql`

Fluxo:
1. Seleciona igreja da reuniao
2. Seleciona data
3. Busca e seleciona o usuario
4. Marca `PRESENTE`, `FALTA` ou `FALTA_JUSTIFICADA`
5. Ao salvar, a function conta faltas sem justificativa dos ultimos 180 dias
6. Se chegar em 3, bloqueia automaticamente o acesso

### Anúncios públicos (tela de login)
```ts
// listAnnouncementsPublicByTotvs: tenta supabaseAnon primeiro,
// depois faz fallback para api.listAnnouncements() se houver token salvo.
// Para funcionar sem token (1º acesso), adicionar RLS anon SELECT no Supabase:
// CREATE POLICY "anon_select_announcements" ON announcements
// FOR SELECT TO anon USING (is_active = true);
```

---

## 13. Endpoints Completos (endpoints.ts)

| Endpoint | Função |
|----------|--------|
| `login` | Autenticar com CPF + senha |
| `select-church` | Selecionar igreja quando usuário tem mais de uma |
| `forgot-password-request` | Solicitar reset de senha |
| `reset-password-confirm` | Confirmar novo senha com token |
| `public-register-member` | Cadastro rápido público |
| `get-my-registration-status` | Status de aprovação do cadastro |
| `dashboard-stats` | Estatísticas do dashboard admin/pastor |
| `list-churches-in-scope` | Listar igrejas do escopo |
| `create-church` | Criar nova igreja |
| `delete-church` | Excluir igreja |
| `list-letters` | Listar cartas com filtros |
| `set-letter-status` | Alterar status de carta |
| `get-letter-pdf-url` | URL assinada para download do PDF |
| `create-letter` | Criar nova carta (dispara n8n) |
| `create-user` | Criar novo usuário (admin) |
| `reset-password` | Resetar senha (admin) |
| `update-my-profile` | Obreiro atualiza próprio perfil |
| `list-workers` | Listar obreiros com paginação |
| `list-members` | Listar membros com filtros avançados |
| `list-pastors` | Listar pastores |
| `set-church-pastor` | Definir pastor da igreja |
| `toggle-worker-active` | Ativar/desativar obreiro |
| `set-worker-direct-release` | Permitir obreiro criar carta liberada diretamente |
| `set-user-registration-status` | Aprovar/pendenciar cadastro |
| `set-user-payment-status` | Ativar/bloquear pagamento |
| `delete-user` | Excluir usuário |
| `worker-dashboard` | Dashboard completo do obreiro (cartas + dados pessoais) |
| `request-release` | Obreiro solicita liberação de carta |
| `list-release-requests` | Admin/pastor lista pedidos de liberação |
| `approve-release` | Aprovar pedido de liberação |
| `deny-release` | Negar pedido de liberação |
| `list-notifications` | Listar notificações do sininho |
| `mark-notification-read` | Marcar notificação como lida |
| `mark-all-notifications-read` | Marcar todas como lidas |
| `list-announcements` | Listar divulgações (autenticado) |
| `birthdays-today` | Aniversariantes do dia |
| `upsert-announcement` | Criar/editar divulgação |
| `delete-announcement` | Excluir divulgação |
| `upsert-stamps` | Salvar assinatura e carimbos |
| `get-church-remanejamento-form` | Formulário de remanejamento de igreja |
| `upsert-church-remanejamento` | Salvar remanejamento |
| `generate-church-remanejamento-pdf` | Gerar PDF do remanejamento |
| `get-church-contrato-form` | Formulário de contrato |
| `upsert-church-contrato` | Salvar contrato |
| `upsert-church-laudo` | Salvar laudo |
| `generate-church-contrato-pdf` | Gerar PDF do contrato |
| `generate-member-docs` | Gerar ficha/carteirinha do membro |
| `get-member-docs-status` | Status da geração dos documentos |

---

## 14. Problemas Conhecidos e Soluções

| Problema | Causa | Solução |
|----------|-------|---------|
| 401 em queries diretas Supabase | `rls_token` usa JWT diferente do segredo nativo do Supabase | Desativar todos `if (supabase && getRlsToken())` com `false &&` |
| 401 em `mark-notification-read` / `mark-all-notifications-read` | Edge function com `verify_jwt = true` (padrão) | Configurar `verify_jwt = false` no Supabase config.toml |
| Dados vazios na ficha de membro | `mapUserLike()` descarta campos extras + select incompleto | Usar spread `{ ...userRaw, ...mapUserLike(userRaw) }` |
| Endereço vazio nos formulários | Código lia de `address_json` que não existe | Ler de colunas planas: `address_street`, `cep` etc. |
| Anúncios vazios na tela de login | Tabela `announcements` sem política RLS anon SELECT | Adicionar policy ou usar fallback via `api.listAnnouncements()` |

---

## 15. Captura de Foto com Detecção de Rosto (face-api.js)

Todos os formulários que exigem foto 3x4 usam o componente `AvatarCapture.tsx` com detecção de rosto em tempo real.

### Como funciona
1. Abre câmera frontal via `getUserMedia`
2. Carrega modelo TinyFaceDetector de `/public/models/`
3. Detecta rosto em tempo real com canvas overlay
4. Guia oval mostra onde posicionar o rosto
5. Retângulo **verde** quando rosto enquadrado / **amarelo** quando detectado fora
6. Botão "Capturar" só ativa quando rosto está dentro do guia
7. Foto capturada: JPEG qualidade 0.82, fundo branco, proporção 3x4 (300×400px)
8. Alternativa: botão "Arquivo" para usar da galeria

### Arquivos de modelo necessários em `/public/models/`
```
tiny_face_detector_model-weights_manifest.json
tiny_face_detector_model-shard1
```
Baixar de: https://github.com/justadudewhohacks/face-api.js/tree/master/weights

### Formulários que usam AvatarCapture
| Formulário | Arquivo |
|---|---|
| Cadastro/edição de membro | `src/components/admin/ObreirosTab.tsx` |
| Cadastro rápido de obreiro | `src/pages/CadastroRapido.tsx` |
| Edição de perfil do usuário | `src/pages/UsuarioDashboard.tsx` |

### ImageCaptureInput (logo/carimbo — SEM detecção de rosto)
Para imagens de igrejas (logo, carimbo, assinatura) usa `ImageCaptureInput.tsx`
que abre editor de recorte com zoom e proporção livre. Não usa face-api.js.

---

## 16. Filtros de Busca nas Páginas de Igrejas e Membros

### Páginas de Igrejas (Admin + Pastor)
- Busca por **nome** com debounce de 400ms
- Select de **classificação** (estadual, setorial, central, regional, local)
- Escopo limitado ao `activeTotvsId` do pastor/admin logado
- Limpar filtros + contador de resultados

### Páginas de Membros (Admin + Pastor)
- Input de busca de **igreja** com combobox (lista filtrada, mostra 10 por padrão)
- Select de **cargo** (pastor, presbítero, diácono, obreiro, membro)
- Input vazio = mostra **todos os membros** do escopo
- `ObreirosTab` aceita prop `filterMinisterRole` para filtro externo

---

## 17. Commits Recentes (referência)

- `28b23d5` — Desativa todos os caminhos diretos Supabase (resolve 401)
- `b327c50` — Corrige mark notifications, anúncios públicos, cabeçalhos JSDoc
- `356cb14` — Corrige notificações: usa edge function via API
- `701694c` — Remove caminho direto em listMembers/listWorkers/listChurchesInScope
- `a957de8` — Adiciona ícones no menu de ações da tabela de cartas
- `0ac19c4` — Corrige problemas críticos/altos/médios (env, tokens, confirm, webhook, skeleton)
- `75d9e27` — Adiciona upload de foto com IA nos formulários de cadastro de membro e igreja
- `654e87a` — Atualiza AvatarCapture com detecção de rosto via face-api.js
