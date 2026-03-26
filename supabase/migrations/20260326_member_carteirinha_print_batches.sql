-- Lotes de impressao de carteirinhas (documento unico por envio)
create table if not exists public.member_carteirinha_print_batches (
  id uuid primary key default gen_random_uuid(),
  church_totvs_id text not null references public.churches(totvs_id) on delete cascade,
  created_by_user_id uuid null references public.users(id) on delete set null,
  status text not null default 'PROCESSANDO'
    check (status in ('PROCESSANDO', 'PRONTO', 'ERRO')),
  total_items integer not null default 0,
  requested_ids text[] not null default '{}',
  final_url text null,
  error_message text null,
  webhook_response jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz null
);

create index if not exists idx_member_carteirinha_print_batches_church_created
  on public.member_carteirinha_print_batches (church_totvs_id, created_at desc);

create index if not exists idx_member_carteirinha_print_batches_status
  on public.member_carteirinha_print_batches (status, created_at desc);

drop trigger if exists trg_member_carteirinha_print_batches_updated_at on public.member_carteirinha_print_batches;
create trigger trg_member_carteirinha_print_batches_updated_at
before update on public.member_carteirinha_print_batches
for each row execute function public.set_updated_at();
