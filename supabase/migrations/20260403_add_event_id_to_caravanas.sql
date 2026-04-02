-- Adicionar coluna event_id à tabela caravanas (referência para announcements)
ALTER TABLE public.caravanas
ADD COLUMN IF NOT EXISTS event_id UUID;

-- Criar índice para filtros por evento
CREATE INDEX IF NOT EXISTS idx_caravanas_event_id ON public.caravanas(event_id);

-- Criar constraint de chave estrangeira (opcional, se quiser garantir integridade)
ALTER TABLE public.caravanas
ADD CONSTRAINT fk_caravanas_event_id
FOREIGN KEY (event_id)
REFERENCES public.announcements(id)
ON DELETE SET NULL;
