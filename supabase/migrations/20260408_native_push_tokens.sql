-- ==========================================================
-- MODULO: Native Push Tokens (FCM Android/iOS)
-- Objetivo: Armazenar tokens FCM dos dispositivos nativos
--           para envio de push via Firebase Cloud Messaging
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.native_push_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  totvs_id text NULL,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'android',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT native_push_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT native_push_tokens_token_unique UNIQUE (token),
  CONSTRAINT native_push_tokens_platform_check CHECK (platform IN ('android', 'ios'))
);

CREATE INDEX IF NOT EXISTS idx_native_push_tokens_user ON public.native_push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_native_push_tokens_totvs ON public.native_push_tokens(totvs_id);
