create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references public.users(id) on delete set null,
  user_name text null,
  user_role text null,
  church_totvs_id text null,
  usability_rating smallint not null check (usability_rating between 1 and 5),
  speed_rating smallint not null check (speed_rating between 1 and 5),
  stability_rating smallint not null check (stability_rating between 1 and 5),
  overall_rating smallint not null check (overall_rating between 1 and 5),
  recommend_level text not null check (recommend_level in ('SIM', 'TALVEZ', 'NAO')),
  primary_need text null,
  improvement_notes text null,
  contact_allowed boolean not null default false,
  status text not null default 'NOVO' check (status in ('NOVO', 'EM_ANALISE', 'CONCLUIDO', 'ARQUIVADO')),
  admin_notes text null,
  reviewed_by_user_id uuid null references public.users(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_feedback_created_at on public.user_feedback (created_at desc);
create index if not exists idx_user_feedback_status on public.user_feedback (status);
create index if not exists idx_user_feedback_church_totvs on public.user_feedback (church_totvs_id);

alter table public.user_feedback enable row level security;
