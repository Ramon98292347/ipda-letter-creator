-- Adicionar coluna totvs_id à tabela caravanas
ALTER TABLE public.caravanas
ADD COLUMN IF NOT EXISTS totvs_id TEXT;

-- Preencher totvs_id com church_code para registros existentes
UPDATE public.caravanas
SET totvs_id = church_code
WHERE totvs_id IS NULL AND church_code IS NOT NULL;

-- Criar índice na coluna totvs_id para filtros de jurisdição
CREATE INDEX IF NOT EXISTS idx_caravanas_totvs_id ON public.caravanas(totvs_id);
