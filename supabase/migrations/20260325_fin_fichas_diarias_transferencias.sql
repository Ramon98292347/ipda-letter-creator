-- ============================================================
-- Migration: adiciona colunas de transferência à fin_fichas_diarias
-- ============================================================
-- Objetivo:
--   Guardar o valor recebido do mês anterior e o valor que será
--   enviado para o mês seguinte, diretamente na ficha diária.
--   Esses valores são salvos junto com as entradas do mês ao
--   clicar em "Salvar Ficha" na página Ficha Diária.
-- ============================================================

ALTER TABLE fin_fichas_diarias
  -- Comentario: valor recebido como transferência do mês anterior
  ADD COLUMN IF NOT EXISTS transferencia_recebida DECIMAL(15,2) DEFAULT 0,

  -- Comentario: valor que será transferido para o próximo mês
  ADD COLUMN IF NOT EXISTS transferencia_enviada  DECIMAL(15,2) DEFAULT 0;
