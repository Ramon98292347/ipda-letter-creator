-- Permite nova classificacao "casa_oracao" na tabela churches
alter table public.churches
drop constraint if exists churches_class_check;

alter table public.churches
add constraint churches_class_check check (
  class = any (
    array[
      'estadual'::text,
      'setorial'::text,
      'central'::text,
      'regional'::text,
      'local'::text,
      'casa_oracao'::text
    ]
  )
);
