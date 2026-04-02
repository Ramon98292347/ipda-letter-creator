-- Criar tabela caravanas se não existir
CREATE TABLE IF NOT EXISTS public.caravanas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  church_code TEXT,
  church_name TEXT NOT NULL,
  city_state TEXT,
  pastor_name TEXT,
  pastor_email TEXT,
  pastor_phone TEXT,
  vehicle_plate TEXT,
  leader_name TEXT NOT NULL,
  leader_whatsapp TEXT,
  passenger_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'Recebida',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_caravanas_church_code ON public.caravanas(church_code);
CREATE INDEX IF NOT EXISTS idx_caravanas_status ON public.caravanas(status);
CREATE INDEX IF NOT EXISTS idx_caravanas_created_at ON public.caravanas(created_at DESC);
