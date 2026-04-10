-- Comentario: campos de auditoria da regra de hierarquia para emissao de cartas.
-- emissora_inicial_totvs_id: igreja que seria a emissora antes da escalada por falta de pastor
-- regra_aplicada: tipo de regra usada (irmas, tia, autoridade_comum, fallback, etc.)
-- motivo_subida_hierarquia: descricao do motivo pelo qual a emissora subiu na hierarquia

ALTER TABLE public.letters
  ADD COLUMN IF NOT EXISTS emissora_inicial_totvs_id text NULL,
  ADD COLUMN IF NOT EXISTS regra_aplicada text NULL,
  ADD COLUMN IF NOT EXISTS motivo_subida_hierarquia text NULL;

COMMENT ON COLUMN public.letters.emissora_inicial_totvs_id IS 'TOTVS da emissora calculada antes da escalada por pastor';
COMMENT ON COLUMN public.letters.regra_aplicada IS 'Regra de hierarquia aplicada: irmas, tia, autoridade_comum, fallback';
COMMENT ON COLUMN public.letters.motivo_subida_hierarquia IS 'Descricao do motivo da subida na hierarquia';
