-- Ativar Realtime para a tabela caravanas
-- Permite que o frontend se inscreva em mudanças em tempo real

-- Garantir que RLS está habilitado
ALTER TABLE public.caravanas ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS caravanas_select_policy ON public.caravanas;
DROP POLICY IF EXISTS caravanas_insert_policy ON public.caravanas;
DROP POLICY IF EXISTS caravanas_update_policy ON public.caravanas;
DROP POLICY IF EXISTS caravanas_delete_policy ON public.caravanas;

-- SELECT: Admin vê tudo, outros veem por evento/jurisdição
CREATE POLICY caravanas_select_policy
ON public.caravanas
FOR SELECT
TO authenticated
USING (
  public.jwt_is_admin()
  OR event_id IN (
    SELECT id FROM public.announcements
    WHERE church_totvs_id = ANY(public.jwt_scope_totvs_ids())
      OR church_totvs_id = public.jwt_active_totvs_id()
  )
  OR event_id IS NULL
);

-- INSERT: Apenas para registro público (sem autenticação necessária via RLS)
CREATE POLICY caravanas_insert_policy
ON public.caravanas
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- UPDATE: Admin e pastores podem atualizar caravanas de seus eventos
CREATE POLICY caravanas_update_policy
ON public.caravanas
FOR UPDATE
TO authenticated
USING (
  public.jwt_is_admin()
  OR event_id IN (
    SELECT id FROM public.announcements
    WHERE church_totvs_id = ANY(public.jwt_scope_totvs_ids())
      OR church_totvs_id = public.jwt_active_totvs_id()
  )
)
WITH CHECK (
  public.jwt_is_admin()
  OR event_id IN (
    SELECT id FROM public.announcements
    WHERE church_totvs_id = ANY(public.jwt_scope_totvs_ids())
      OR church_totvs_id = public.jwt_active_totvs_id()
  )
);

-- DELETE: Apenas admin
CREATE POLICY caravanas_delete_policy
ON public.caravanas
FOR DELETE
TO authenticated
USING (public.jwt_is_admin());
