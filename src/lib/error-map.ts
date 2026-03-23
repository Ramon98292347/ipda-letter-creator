type ErrorContext =
  | "auth"
  | "workers"
  | "churches"
  | "announcements"
  | "letters"
  | "generic";

type ErrorLike = {
  code?: string;
  message?: string;
  details?: {
    error?: string;
    detail?: string;
    message?: string;
  };
};

const CODE_MAP: Record<string, string> = {
  invalid_login: "CPF ou senha errada. Tente novamente ou clique em Esquecer senha.",
  "invalid-credentials": "CPF ou senha errada. Tente novamente ou clique em Esquecer senha.",
  invalid_credentials: "CPF ou senha errada. Tente novamente ou clique em Esquecer senha.",
  unauthorized: "CPF ou senha errada. Tente novamente ou clique em Esquecer senha.",
  missing_jwt_secret: "Erro no servidor: USER_SESSION_JWT_SECRET não configurado.",
  forbidden_wrong_church: "Você não pode alterar membros de outra igreja.",
  target_is_not_obreiro: "Ação permitida apenas para membros.",
  cannot_release_self_direct: "Você não pode liberar o seu próprio cadastro. Peça para a igreja acima liberar.",
  cannot_toggle_self: "Você não pode desativar o seu próprio cadastro.",
  cannot_delete_self: "Você não pode deletar o seu próprio cadastro.",
  worker_out_of_scope: "Esse membro está fora do seu escopo de igrejas.",
  forbidden_hierarchy: "Você não tem permissão de hierarquia para essa ação.",
  worker_not_found: "Membro não encontrado.",
  has_active_children: "Não é possível desativar: existem igrejas filhas ativas.",
  pastor_no_totvs_access: "Esse pastor não possui acesso a essa igreja.",
  totvs_out_of_scope: "Você não tem permissão para essa igreja.",
  cannot_release_without_pdf: "Não é possível liberar carta sem PDF pronto.",
  letter_not_released: "Carta ainda não liberada.",
  weekly_limit_reached: "Limite semanal de cartas atingido.",
  inactive_user: "Seu cadastro está bloqueado. Procure a secretaria da igreja para normalizar o cadastro.",
  blocked_payment: "Seu acesso está bloqueado por falta de pagamento. Procure a secretaria da igreja.",
  blocked_discipline: "Seu acesso está bloqueado por faltas sem justificativa em reuniões ministeriais.",
  forbidden_only_admin: "Somente admin pode executar esta ação.",
  cannot_block_self_payment: "Você não pode bloquear o seu próprio cadastro por pagamento.",
  church_out_of_scope: "Você não pode marcar presença para uma igreja fora do seu escopo.",
  user_not_in_selected_church: "Esse usuário não pertence à igreja selecionada.",
  invalid_meeting_date: "Informe uma data válida para a reunião.",
  invalid_status: "Selecione um status de presença válido.",
  missing_justification: "Informe a justificativa da falta.",
  meeting_not_found: "Essa reunião não foi encontrada.",
  meeting_inactive: "Essa lista de presença foi desativada.",
  meeting_expired: "Essa lista de presença expirou.",
  invalid_expires_at: "Informe uma validade correta para o link da reunião.",
  meeting_date_in_past: "A data da reunião não pode estar no passado.",
  db_error_create_meeting: "Não foi possível criar a reunião ministerial.",
  db_error_update_meeting: "Não foi possível atualizar a reunião ministerial.",
  db_error_meetings: "Não foi possível listar as reuniões ministeriais.",
  missing_identifier: "Informe CPF ou e-mail para recuperar a senha.",
  church_not_found: "Sua igreja não existe no cadastro. Peça ao pastor para cadastrar primeiro.",
  cpf_already_registered: "CPF já cadastrado no sistema.",
  password_too_short: "A senha precisa ter pelo menos 6 caracteres.",
  invalid_or_expired_token: "Link de redefinição inválido ou expirado. Solicite um novo.",
  missing_token: "Link de redefinição inválido.",
};

const DEFAULT_MAP: Record<ErrorContext, string> = {
  auth: "CPF ou senha errada. Tente novamente ou clique em Esquecer senha.",
  workers: "Falha ao processar membro.",
  churches: "Falha ao processar igreja.",
  announcements: "Falha ao processar divulgação.",
  letters: "Falha ao processar carta.",
  generic: "Falha na operação.",
};

export function getFriendlyError(err: unknown, context: ErrorContext = "generic") {
  const normalized = (err || {}) as ErrorLike;
  const code = String(normalized.code || normalized.details?.error || "").toLowerCase();
  const message = String(normalized.message || "").toLowerCase();
  const detail = String(normalized.details?.detail || normalized.details?.message || "");

  if (detail) return detail;
  if (code && CODE_MAP[code]) return CODE_MAP[code];
  if (message && CODE_MAP[message]) return CODE_MAP[message];
  if (message.includes("failed to fetch")) return "Sem conexão com o servidor.";
  return DEFAULT_MAP[context];
}
