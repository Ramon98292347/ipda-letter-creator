-- Adiciona coluna para registrar aceite LGPD no cadastro rapido
ALTER TABLE users ADD COLUMN IF NOT EXISTS lgpd_consent_at timestamptz DEFAULT NULL;
