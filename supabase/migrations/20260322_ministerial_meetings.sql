create table if not exists public.ministerial_meetings (
  id uuid not null default gen_random_uuid(),
  church_totvs_id text not null,
  title text null,
  meeting_date date not null,
  public_token text not null,
  expires_at timestamptz not null,
  is_active boolean not null default true,
  notes text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ministerial_meetings_pkey primary key (id),
  constraint ministerial_meetings_church_fkey foreign key (church_totvs_id) references public.churches (totvs_id) on delete cascade,
  constraint ministerial_meetings_created_by_fkey foreign key (created_by) references public.users (id) on delete set null,
  constraint ministerial_meetings_public_token_key unique (public_token)
);

create index if not exists idx_ministerial_meetings_church_date
on public.ministerial_meetings using btree (church_totvs_id, meeting_date desc);

create index if not exists idx_ministerial_meetings_active_date
on public.ministerial_meetings using btree (is_active, meeting_date desc);

drop trigger if exists trg_ministerial_meetings_set_updated_at
on public.ministerial_meetings;

create trigger trg_ministerial_meetings_set_updated_at
before update on public.ministerial_meetings
for each row execute function public.set_current_timestamp_updated_at();
