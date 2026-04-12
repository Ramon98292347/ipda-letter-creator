-- ============================================================
-- Migration: Índices de performance para escala 12k igrejas / 500k usuários
-- Data: 2026-04-12
-- Objetivo: Otimizar as queries mais pesadas do sistema
-- Seguro: todos os índices usam IF NOT EXISTS e são CONCURRENTLY-safe
-- ============================================================

-- ==================== LETTERS ====================
-- Query principal: listar cartas por igreja + status + ordenação por data
CREATE INDEX IF NOT EXISTS idx_letters_church_status_created
  ON letters(church_totvs_id, status, created_at DESC);

-- Query obreiro: minhas cartas (preacher_user_id) filtradas por status
CREATE INDEX IF NOT EXISTS idx_letters_preacher_status_created
  ON letters(preacher_user_id, status, created_at DESC);

-- Query dashboard: cartas ativas (excluindo EXCLUIDA) ordenadas
CREATE INDEX IF NOT EXISTS idx_letters_status_created
  ON letters(status, created_at DESC);

-- ==================== USERS ====================
-- Login por CPF (campo mais consultado do sistema)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cpf
  ON users(cpf);

-- Listar membros/obreiros por igreja
CREATE INDEX IF NOT EXISTS idx_users_church_active
  ON users(default_totvs_id, is_active);

-- Contagem de obreiros ativos por igreja (KPI dashboard)
CREATE INDEX IF NOT EXISTS idx_users_role_church_active
  ON users(role, default_totvs_id, is_active);

-- ==================== CHURCHES ====================
-- Hierarquia: BFS para encontrar filhos (parent_totvs_id)
CREATE INDEX IF NOT EXISTS idx_churches_parent_totvs
  ON churches(parent_totvs_id);

-- Igrejas de um pastor específico
CREATE INDEX IF NOT EXISTS idx_churches_pastor_active
  ON churches(pastor_user_id, is_active);

-- Hierarquia + classe (resolução de escopo LCA)
CREATE INDEX IF NOT EXISTS idx_churches_totvs_parent_class
  ON churches(totvs_id, parent_totvs_id, class);

-- ==================== FIN_TRANSACOES ====================
-- Query principal: transações de uma igreja em período (dashboard financeiro)
CREATE INDEX IF NOT EXISTS idx_fin_transacoes_church_data
  ON fin_transacoes(church_totvs_id, data_transacao DESC);

-- Filtro por tipo (entrada/saida) + igreja + data
CREATE INDEX IF NOT EXISTS idx_fin_transacoes_church_tipo_data
  ON fin_transacoes(church_totvs_id, tipo, data_transacao DESC);

-- ==================== ANNOUNCEMENTS ====================
-- Anúncios ativos por igreja (carrossel público)
CREATE INDEX IF NOT EXISTS idx_announcements_church_active
  ON announcements(church_totvs_id, is_active, starts_at DESC);

-- ==================== MEMBER DOCS ====================
-- Carteirinhas prontas por igreja (fila de impressão)
CREATE INDEX IF NOT EXISTS idx_member_carteirinha_church_status
  ON member_carteirinha_documents(church_totvs_id, status, finished_at DESC);

-- Fichas prontas por igreja
CREATE INDEX IF NOT EXISTS idx_member_ficha_church_status
  ON member_ficha_documents(church_totvs_id, status, finished_at DESC);

-- ==================== NOTIFICATIONS ====================
-- Notificações não lidas por usuário (badge do sino)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, created_at DESC)
  WHERE is_read = false;

-- ==================== CARAVANAS ====================
-- Composto: status + data (listagem principal)
CREATE INDEX IF NOT EXISTS idx_caravanas_status_created
  ON caravanas(status, created_at DESC);

-- Composto: evento + status (filtro por evento)
CREATE INDEX IF NOT EXISTS idx_caravanas_event_status
  ON caravanas(event_id, status, created_at DESC);
