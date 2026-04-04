-- Push nativo (Android/iOS): tokens FCM/APNs para envio com app fechado

CREATE TABLE IF NOT EXISTS public.native_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  totvs_id text,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'android',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_native_push_tokens_user ON public.native_push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_native_push_tokens_totvs ON public.native_push_tokens(totvs_id);

ALTER TABLE public.native_push_tokens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'native_push_tokens'
      AND policyname = 'native_push_tokens_service_role_all'
  ) THEN
    CREATE POLICY native_push_tokens_service_role_all
      ON public.native_push_tokens
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;
