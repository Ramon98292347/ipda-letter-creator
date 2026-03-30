-- ============================================================================
-- Modulo Deposito: controle de estoque de materiais evangelisticos e livraria
-- Tabelas: deposit_products, deposit_stock, deposit_movements
-- ============================================================================

-- Comentario: tabela de produtos/mercadorias do deposito
CREATE TABLE IF NOT EXISTS deposit_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text NOT NULL,
  group_name text NOT NULL,
  subgroup text,
  unit text NOT NULL DEFAULT 'UN',
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  min_stock integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Comentario: saldo de estoque por produto e por igreja
CREATE TABLE IF NOT EXISTS deposit_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES deposit_products(id) ON DELETE CASCADE,
  church_totvs_id text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, church_totvs_id)
);

-- Comentario: historico de movimentacoes do estoque
CREATE TABLE IF NOT EXISTS deposit_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES deposit_products(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('ENTRADA','SAIDA','TRANSFERENCIA','AJUSTE','PERDA')),
  quantity integer NOT NULL,
  unit_price numeric(12,2),
  church_origin_totvs text,
  church_destination_totvs text,
  responsible_user_id uuid,
  responsible_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Comentario: indices para performance nas consultas mais comuns
CREATE INDEX IF NOT EXISTS idx_deposit_stock_product ON deposit_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_deposit_stock_church ON deposit_stock(church_totvs_id);
CREATE INDEX IF NOT EXISTS idx_deposit_movements_product ON deposit_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_deposit_movements_type ON deposit_movements(type);
CREATE INDEX IF NOT EXISTS idx_deposit_movements_created ON deposit_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_deposit_movements_church_origin ON deposit_movements(church_origin_totvs);

-- ============================================================================
-- Dados iniciais: produtos evangelisticos padrao
-- ============================================================================

INSERT INTO deposit_products (code, description, group_name, subgroup, unit, unit_price) VALUES
-- VOTOS
('3560', 'VOTO REUNIÃO DE OBREIROS', 'VOTOS', 'VOTOS', 'UN', 0),
('1620', 'VOTO DO LIVRAMENTO', 'VOTOS', 'VOTOS', 'UN', 0),
('3644', 'VOTO DO DÍZIMO', 'VOTOS', 'VOTOS', 'UN', 0),
('1623', 'VOTO DO ALUGUEL', 'VOTOS', 'VOTOS', 'UN', 0),
('1626', 'VOTO DEUS RESOLVE TUDO', 'VOTOS', 'VOTOS', 'UN', 0),
('3553', 'VOTO O GRANDE CLAMOR PELA FAMÍLIA', 'VOTOS', 'VOTOS', 'UN', 0),
('3564', 'VOTO UMA CARTA PARA DEUS', 'VOTOS', 'VOTOS', 'UN', 0),
('1621', 'VOTO O SANGUE DE JESUS TEM PODER', 'VOTOS', 'VOTOS', 'UN', 0),
('3643', 'VOTO DA PROVIDÊNCIA DE DEUS', 'VOTOS', 'VOTOS', 'UN', 0),
('1622', 'VOTO DA SANTA CEIA', 'VOTOS', 'VOTOS', 'UN', 0),
('1624', 'VOTO DA PROSPERIDADE SALMO 23', 'VOTOS', 'VOTOS', 'UN', 0),
('1625', 'VOTO A MINHA FAMÍLIA NOS PLANOS DE DEUS', 'VOTOS', 'VOTOS', 'UN', 0),
('3562', 'VOTO SALMO 91', 'VOTOS', 'VOTOS', 'UN', 0),
('3642', 'VOTO DO BATISMO', 'VOTOS', 'VOTOS', 'UN', 0),
('3555', 'VOTO O MEU PROJETO NAS MÃOS DE DEUS', 'VOTOS', 'VOTOS', 'UN', 0),
-- FOLHETOS
('3240', 'FOLHETO DE EVANGELIZAÇÃO', 'FOLHETOS', 'FOLHETOS', 'UN', 0),
('3239', 'FOLHETO BEM VINDO A VIDA', 'FOLHETOS', 'FOLHETOS', 'UN', 0),
-- FICHAS
('3238', 'FICHA DE MEMBRO', 'FICHAS', 'FICHAS', 'UN', 0),
('3493', 'FICHA DE CADASTRO DE OBREIROS', 'FICHAS', 'FICHAS', 'UN', 0),
-- MANUAL
('3213', 'MANUAL DO BATISMO', 'MANUAL', 'MANUAL', 'UN', 0),
-- CERTIFICADOS
('3235', 'CERTIFICADO DE APRESENTAÇÃO CRIANÇA', 'CERTIFICADOS', 'CERTIFICADOS', 'UN', 0),
('3236', 'CERTIFICADO DO BATISMO', 'CERTIFICADOS', 'CERTIFICADOS', 'UN', 0),
-- CARTAO
('3231', 'CARTÃO DÍZIMO', 'CARTÃO', 'CARTÃO', 'UN', 0),
('1658', 'CARTÃO DE AUTORIZAÇÃO PARA BATISMO', 'CARTÃO', 'CARTÃO', 'UN', 0),
-- CARTA
('3229', 'CARTA DE PREGAÇÃO DE UM DIA (BLOCO)', 'CARTA', 'CARTA', 'UN', 0),
('1638', 'CARTA DE RECOMENDAÇÃO', 'CARTA', 'CARTA', 'UN', 0),
-- CARNES
('3227', 'CARNÊ DO ALUGUEL', 'CARNÊS', 'CARNÊS', 'UN', 0),
('3228', 'CARNÊ PROGRAMA DE RÁDIO', 'CARNÊS', 'CARNÊS', 'UN', 0),
-- LIVRO
('3242', 'LIVRO DE CADASTRO (MEMBROS)', 'LIVRO', 'LIVRO', 'UN', 0)
ON CONFLICT (code) DO NOTHING;
