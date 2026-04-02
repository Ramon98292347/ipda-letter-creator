-- Add pastor_email and pastor_phone fields to caravanas table
ALTER TABLE caravanas
ADD COLUMN IF NOT EXISTS pastor_email TEXT,
ADD COLUMN IF NOT EXISTS pastor_phone TEXT;
