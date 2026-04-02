-- Ativar Realtime para a tabela caravanas
-- A tabela é pública porque recebe dados de registro sem autenticação
-- Realtime é habilitado por padrão no Supabase para todas as tabelas

-- DESABILITAR RLS para permitir acesso público
ALTER TABLE public.caravanas DISABLE ROW LEVEL SECURITY;

-- Remover todas as policies se existirem
DROP POLICY IF EXISTS caravanas_select_policy ON public.caravanas;
DROP POLICY IF EXISTS caravanas_insert_policy ON public.caravanas;
DROP POLICY IF EXISTS caravanas_update_policy ON public.caravanas;
DROP POLICY IF EXISTS caravanas_delete_policy ON public.caravanas;
