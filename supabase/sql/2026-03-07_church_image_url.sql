-- Comentario: adiciona campo de foto da igreja para uso nos formularios Nova/Editar Igreja.
alter table public.churches
add column if not exists image_url text null;
