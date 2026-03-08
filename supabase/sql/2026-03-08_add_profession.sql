alter table public.users
add column if not exists profession text null;

create index if not exists idx_users_profession on public.users using btree (profession);
