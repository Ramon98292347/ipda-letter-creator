-- Migration: login_attempts
-- Tabela para rate limiting persistente do login.
-- Registra tentativas de login por CPF para bloquear força bruta,
-- mesmo após cold start das edge functions.

CREATE TABLE IF NOT EXISTS login_attempts (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  cpf        text        NOT NULL,
  ip         text        NOT NULL DEFAULT 'unknown',
  success    boolean     NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Comentario: índice para busca rápida por CPF nas últimas N tentativas
CREATE INDEX IF NOT EXISTS idx_login_attempts_cpf_created
  ON login_attempts (cpf, created_at DESC);

-- Comentario: índice por IP para rate limit por endereço de rede
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_created
  ON login_attempts (ip, created_at DESC);

-- Comentario: habilita pg_cron para limpeza automática de registros antigos.
-- Se a extensão não estiver ativa, habilite pelo painel do Supabase:
-- Dashboard → Database → Extensions → pg_cron → ativar
-- Depois rode o SELECT abaixo separadamente.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Roda todo dia às 03:00 UTC e apaga tentativas com mais de 24 horas.
-- Isso mantém a tabela pequena mesmo com 2000 usuários.
SELECT cron.schedule(
  'cleanup-login-attempts',
  '0 3 * * *',
  $$DELETE FROM login_attempts WHERE created_at < now() - interval '24 hours';$$
);
