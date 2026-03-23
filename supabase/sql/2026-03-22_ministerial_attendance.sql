alter table public.users
add column if not exists discipline_status text not null default 'ATIVO',
add column if not exists discipline_block_reason text null,
add column if not exists discipline_blocked_at timestamp with time zone null,
add column if not exists discipline_unblocked_at timestamp with time zone null,
add column if not exists discipline_updated_by uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_discipline_status_check'
  ) then
    alter table public.users
    add constraint users_discipline_status_check
    check (discipline_status in ('ATIVO', 'BLOQUEADO_DISCIPLINA'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_discipline_updated_by_fkey'
  ) then
    alter table public.users
    add constraint users_discipline_updated_by_fkey
    foreign key (discipline_updated_by) references public.users(id) on delete set null;
  end if;
end $$;

create index if not exists idx_users_discipline_status
  on public.users using btree (discipline_status);

create index if not exists idx_users_totvs_discipline_status
  on public.users using btree (default_totvs_id, discipline_status);

create table if not exists public.ministerial_meeting_attendance (
  id uuid not null default gen_random_uuid(),
  meeting_date date not null,
  church_totvs_id text not null,
  user_id uuid not null,
  status text not null,
  justification_text text null,
  blocked_on_save boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  marked_by uuid not null,
  constraint ministerial_meeting_attendance_pkey primary key (id),
  constraint ministerial_meeting_attendance_user_fkey
    foreign key (user_id) references public.users(id) on delete cascade,
  constraint ministerial_meeting_attendance_marked_by_fkey
    foreign key (marked_by) references public.users(id) on delete set null,
  constraint ministerial_meeting_attendance_church_fkey
    foreign key (church_totvs_id) references public.churches(totvs_id) on delete cascade,
  constraint ministerial_meeting_attendance_status_check
    check (status in ('PRESENTE', 'FALTA', 'FALTA_JUSTIFICADA'))
);

create unique index if not exists ministerial_meeting_attendance_unique_user_day_idx
  on public.ministerial_meeting_attendance using btree (user_id, meeting_date);

create index if not exists ministerial_meeting_attendance_church_date_idx
  on public.ministerial_meeting_attendance using btree (church_totvs_id, meeting_date desc);

create index if not exists ministerial_meeting_attendance_user_date_idx
  on public.ministerial_meeting_attendance using btree (user_id, meeting_date desc);

create index if not exists ministerial_meeting_attendance_status_date_idx
  on public.ministerial_meeting_attendance using btree (status, meeting_date desc);

drop trigger if exists trg_ministerial_meeting_attendance_set_updated_at on public.ministerial_meeting_attendance;

create trigger trg_ministerial_meeting_attendance_set_updated_at
before update on public.ministerial_meeting_attendance
for each row
execute function set_updated_at();
