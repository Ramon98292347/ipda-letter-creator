 -- ============================================================
-- Migration: Garantir que jwt_scope_totvs_ids() usa CTE recursiva
-- Data: 2026-04-13
-- Problema: A migration 20260412_fix_jwt_claim_reader.sql pode ter
--           sobrescrito jwt_scope_totvs_ids() com a versao que le do JWT.
--           Esta migration garante que a versao dinamica (CTE recursiva)
--           esteja ativa, resolvendo o escopo diretamente da tabela churches.
-- ============================================================

-- Recriar jwt_scope_root_totvs (resolve raiz por role)
CREATE OR REPLACE FUNCTION public.jwt_scope_root_totvs()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT CASE
    WHEN lower(public.jwt_claim_text('app_role')) = 'pastor' THEN
      coalesce(
        (
          WITH pastor_churches AS (
            SELECT totvs_id, parent_totvs_id
            FROM churches
            WHERE pastor_user_id = auth.uid()
              AND is_active = true
          ),
          top_church AS (
            SELECT pc.totvs_id
            FROM pastor_churches pc
            WHERE pc.parent_totvs_id IS NULL
               OR pc.parent_totvs_id NOT IN (SELECT totvs_id FROM pastor_churches)
            LIMIT 1
          )
          SELECT totvs_id FROM top_church
        ),
        public.jwt_active_totvs_id()
      )
    WHEN lower(public.jwt_claim_text('app_role')) = 'secretario' THEN
      coalesce(
        (
          WITH active_church AS (
            SELECT pastor_user_id
            FROM churches
            WHERE totvs_id = public.jwt_active_totvs_id()
              AND is_active = true
            LIMIT 1
          ),
          pastor_churches AS (
            SELECT c.totvs_id, c.parent_totvs_id
            FROM churches c, active_church ac
            WHERE c.pastor_user_id = ac.pastor_user_id
              AND c.is_active = true
          ),
          top_church AS (
            SELECT pc.totvs_id
            FROM pastor_churches pc
            WHERE pc.parent_totvs_id IS NULL
               OR pc.parent_totvs_id NOT IN (SELECT totvs_id FROM pastor_churches)
            LIMIT 1
          )
          SELECT totvs_id FROM top_church
        ),
        public.jwt_active_totvs_id()
      )
    ELSE
      public.jwt_active_totvs_id()
  END;
$$;

-- Recriar jwt_scope_totvs_ids com CTE recursiva (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.jwt_scope_totvs_ids()
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH RECURSIVE tree AS (
    SELECT totvs_id
    FROM churches
    WHERE totvs_id = public.jwt_scope_root_totvs()
    UNION ALL
    SELECT c.totvs_id
    FROM churches c
    INNER JOIN tree t ON c.parent_totvs_id = t.totvs_id
  )
  SELECT coalesce(array_agg(totvs_id), ARRAY[]::text[])
  FROM tree;
$$;
