-- ============================================================
-- Migration: padroniza valores de minister_role na tabela users
-- ============================================================
-- Objetivo:
--   1. Corrige registros antigos que usavam versão sem acento
--      ("Diacono" → "Diácono", "Presbitero" → "Presbítero")
--   2. Adiciona uma CHECK constraint para garantir que apenas
--      valores válidos sejam salvos daqui em diante.
-- ============================================================

-- Passo 1: atualiza registros sem acento (versão antiga)
UPDATE users
SET minister_role = 'Diácono'
WHERE minister_role IN ('Diacono', 'diacono', 'Diácono');  -- inclui já correto para ser idempotente

UPDATE users
SET minister_role = 'Presbítero'
WHERE minister_role IN ('Presbitero', 'presbitero', 'Presbítero');

-- Passo 2: normaliza outros valores para capitalização correta
UPDATE users SET minister_role = 'Pastor'      WHERE lower(minister_role) = 'pastor'      AND minister_role <> 'Pastor';
UPDATE users SET minister_role = 'Obreiro'     WHERE lower(minister_role) = 'obreiro'     AND minister_role <> 'Obreiro';
UPDATE users SET minister_role = 'Cooperador'  WHERE lower(minister_role) = 'cooperador'  AND minister_role <> 'Cooperador';
UPDATE users SET minister_role = 'Membro'      WHERE lower(minister_role) = 'membro'      AND minister_role <> 'Membro';

-- Passo 3: adiciona CHECK constraint com valores permitidos
-- (DROP primeiro para permitir re-execução sem erro)
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_minister_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_minister_role_check
  CHECK (
    minister_role IS NULL OR minister_role IN (
      'Pastor',
      'Presbítero',
      'Diácono',
      'Obreiro',
      'Cooperador',
      'Membro',
      -- valores extras presentes no sistema de cartas
      'Voluntario Financeiro',
      'Dirigente',
      'Conselheiro Espiritual'
    )
  );
