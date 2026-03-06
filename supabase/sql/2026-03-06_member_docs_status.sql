-- ==========================================================
-- MODULO: Documentos de membro (ficha + carteirinha)
-- Objetivo:
-- - Controlar status de confeccao no banco
-- - Guardar URL final da ficha e da carteirinha
-- - Permitir regra: carteirinha so apos ficha pronta
-- ==========================================================

create table if not exists public.member_ficha_documents (
  id uuid not null default gen_random_uuid (),
  member_id uuid not null,
  church_totvs_id text not null,
  status text not null default 'RASCUNHO',
  request_payload jsonb not null default '{}'::jsonb,
  requested_by_user_id uuid null,
  requested_at timestamp with time zone null,
  final_url text null,
  webhook_response jsonb not null default '{}'::jsonb,
  error_message text null,
  finished_at timestamp with time zone null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint member_ficha_documents_pkey primary key (id),
  constraint member_ficha_documents_member_fk foreign key (member_id) references public.users (id) on delete cascade,
  constraint member_ficha_documents_church_fk foreign key (church_totvs_id) references public.churches (totvs_id) on delete cascade,
  constraint member_ficha_documents_user_fk foreign key (requested_by_user_id) references public.users (id) on delete set null,
  constraint member_ficha_documents_status_check check (
    status = any (array['RASCUNHO'::text, 'ENVIADO_CONFECCAO'::text, 'PRONTO'::text, 'ERRO'::text])
  ),
  constraint member_ficha_documents_unique unique (member_id, church_totvs_id)
);

create table if not exists public.member_carteirinha_documents (
  id uuid not null default gen_random_uuid (),
  member_id uuid not null,
  church_totvs_id text not null,
  status text not null default 'RASCUNHO',
  request_payload jsonb not null default '{}'::jsonb,
  requested_by_user_id uuid null,
  requested_at timestamp with time zone null,
  ficha_url_qr text null,
  final_url text null,
  webhook_response jsonb not null default '{}'::jsonb,
  error_message text null,
  finished_at timestamp with time zone null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint member_carteirinha_documents_pkey primary key (id),
  constraint member_carteirinha_documents_member_fk foreign key (member_id) references public.users (id) on delete cascade,
  constraint member_carteirinha_documents_church_fk foreign key (church_totvs_id) references public.churches (totvs_id) on delete cascade,
  constraint member_carteirinha_documents_user_fk foreign key (requested_by_user_id) references public.users (id) on delete set null,
  constraint member_carteirinha_documents_status_check check (
    status = any (array['RASCUNHO'::text, 'ENVIADO_CONFECCAO'::text, 'PRONTO'::text, 'ERRO'::text])
  ),
  constraint member_carteirinha_documents_unique unique (member_id, church_totvs_id)
);

create index if not exists idx_member_ficha_documents_member on public.member_ficha_documents using btree (member_id, church_totvs_id);
create index if not exists idx_member_ficha_documents_status on public.member_ficha_documents using btree (status, updated_at desc);
create index if not exists idx_member_carteirinha_documents_member on public.member_carteirinha_documents using btree (member_id, church_totvs_id);
create index if not exists idx_member_carteirinha_documents_status on public.member_carteirinha_documents using btree (status, updated_at desc);
