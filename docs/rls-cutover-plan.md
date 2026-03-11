# Plano Faseado - Desativacao Segura de Functions de Leitura (RLS)

Data: 2026-03-11
Projeto: Sistema de Gestao Eclesiastica (IPDA)

## Objetivo
Remover gradualmente as Edge Functions de leitura, mantendo seguranca e estabilidade, apos migracao de leitura para RLS direto no front.

## Escopo
Functions de leitura candidatas:
- list-members
- list-churches-in-scope
- list-letters
- list-notifications
- mark-notification-read
- mark-all-notifications-read
- worker-dashboard
- birthdays-today
- get-my-registration-status

Functions criticas que permanecem:
- create-letter
- set-letter-status
- approve-release
- deny-release
- request-release
- create-user
- toggle-worker-active
- set-user-payment-status
- reset-password-confirm
- forgot-password-request
- public-register-member
- generate-* / upsert-* / n8n / PDF

---

## Fase 1 - Observacao (7 dias)
Status esperado: front usa RLS como caminho principal; functions antigas ficam apenas como fallback.

Checklist:
1. Confirmar no front que chamadas principais vao para Supabase direto (RLS).
2. Monitorar erros no browser (401/403/500).
3. Monitorar logs das functions de leitura para confirmar queda de uso.
4. Validar perfis: admin, pastor, obreiro, membro.

Saida da fase:
- Taxa de erro baixa e sem regressao funcional.

---

## Fase 2 - Corte de Fallback no Front
Status esperado: sem fallback para functions de leitura.

Checklist:
1. Remover fallback em `src/services/saasService.ts` para os metodos de leitura.
2. Manter mensagens de erro amigaveis no front.
3. Validar novamente as telas:
   - Membros
   - Igrejas
   - Cartas
   - Notificacoes
   - Dashboard obreiro
   - Divulgacao
   - Aniversarios
4. Executar build e smoke test.

Saida da fase:
- Front 100% leitura por RLS.

---

## Fase 3 - Descontinuar Functions de Leitura
Status esperado: functions de leitura fora de operacao sem impacto.

Checklist:
1. Marcar functions de leitura como "deprecated" (documentacao interna).
2. Parar deploy dessas functions.
3. Opcional: remover codigo/folders das functions de leitura do repositorio.
4. Atualizar runbooks e README tecnico.

Saida da fase:
- Menor custo operacional e menos superficie de manutencao.

---

## Plano de Rollback
Se houver regressao:
1. Reativar fallback no front para o endpoint afetado.
2. Revisar policy RLS da tabela correspondente.
3. Validar claims do `rls_token`:
   - role
   - active_totvs_id
   - scope_totvs_ids
4. Republicar front.

---

## Metricas de Aceite
- Erros 401/403 inesperados <= 1% nas leituras.
- Zero bloqueio de fluxo critico (login, membros, cartas, notificacoes).
- Tempo medio de carregamento igual ou melhor que baseline anterior.

---

## Observacao Importante
Role define permissao do sistema.
`minister_role` define cargo ministerial e nao substitui role.

