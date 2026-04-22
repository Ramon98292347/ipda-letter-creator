ALTER TABLE IF EXISTS public.member_ficha_obreiro_documents
  ADD COLUMN IF NOT EXISTS url text;

-- ============================================================
-- TABELA: public.member_ficha_obreiro_forms
-- Finalidade:
-- - Salvar dados da aba "Ficha de obreiro"
-- - Controlar status de envio para webhook (n8n)
-- - Guardar URL final retornada pelo n8n
-- ============================================================

create table if not exists public.member_ficha_obreiro_forms (
  id uuid not null default gen_random_uuid(),
  member_id uuid not null,
  church_totvs_id text not null,
  requested_by_user_id uuid null,

  -- Controle de fluxo
  status text not null default 'RASCUNHO',
  url text null, -- URL final do arquivo pronto (retorno n8n)
  error_message text null,

  -- Dados
  form_payload jsonb not null default '{}'::jsonb,      -- dados preenchidos na aba
  prefill_snapshot jsonb not null default '{}'::jsonb,  -- snapshot dos dados já existentes (users/churches)
  webhook_response jsonb not null default '{}'::jsonb,  -- resposta bruta do webhook

  -- Datas
  sent_at timestamptz null,
  processed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint member_ficha_obreiro_forms_pkey primary key (id),

  constraint member_ficha_obreiro_forms_member_fk
    foreign key (member_id) references public.users (id) on delete cascade,

  constraint member_ficha_obreiro_forms_church_fk
    foreign key (church_totvs_id) references public.churches (totvs_id) on delete cascade,

  constraint member_ficha_obreiro_forms_requested_by_fk
    foreign key (requested_by_user_id) references public.users (id) on delete set null,

  constraint member_ficha_obreiro_forms_status_check
    check (status = any (array['RASCUNHO','ENVIADO_WEBHOOK','PROCESSADO','ERRO'])),

  constraint member_ficha_obreiro_forms_unique
    unique (member_id, church_totvs_id)
);

-- Índices úteis
create index if not exists idx_member_ficha_obreiro_forms_member_church
  on public.member_ficha_obreiro_forms (member_id, church_totvs_id);

create index if not exists idx_member_ficha_obreiro_forms_status_updated
  on public.member_ficha_obreiro_forms (status, updated_at desc);

create index if not exists idx_member_ficha_obreiro_forms_church
  on public.member_ficha_obreiro_forms (church_totvs_id);

create index if not exists idx_member_ficha_obreiro_forms_requested_by
  on public.member_ficha_obreiro_forms (requested_by_user_id);
