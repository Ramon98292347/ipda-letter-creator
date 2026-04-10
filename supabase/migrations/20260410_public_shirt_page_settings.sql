create table if not exists public.public_shirt_page_settings (
  id uuid not null default gen_random_uuid(),
  page_totvs_id text not null,
  responsavel_user_id uuid not null,
  responsavel_nome text not null,
  responsavel_telefone text null,
  responsavel_email text null,
  is_active boolean not null default true,
  created_by_user_id uuid null,
  updated_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_shirt_page_settings_pkey primary key (id),
  constraint public_shirt_page_settings_page_totvs_id_key unique (page_totvs_id),
  constraint public_shirt_page_settings_page_totvs_id_fkey foreign key (page_totvs_id) references public.churches (totvs_id) on delete cascade,
  constraint public_shirt_page_settings_responsavel_user_id_fkey foreign key (responsavel_user_id) references public.users (id) on delete restrict,
  constraint public_shirt_page_settings_created_by_user_id_fkey foreign key (created_by_user_id) references public.users (id) on delete set null,
  constraint public_shirt_page_settings_updated_by_user_id_fkey foreign key (updated_by_user_id) references public.users (id) on delete set null
);

create index if not exists idx_public_shirt_page_settings_page_totvs_id on public.public_shirt_page_settings (page_totvs_id);
create index if not exists idx_public_shirt_page_settings_responsavel_user_id on public.public_shirt_page_settings (responsavel_user_id);

create trigger trg_public_shirt_page_settings_set_updated_at
before update on public.public_shirt_page_settings
for each row execute function public.set_updated_at();
