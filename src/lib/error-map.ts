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
  invalid_login: "CPF ou senha inválidos.",
  invalid_credentials: "CPF ou senha inválidos.",
  missing_jwt_secret: "Erro no servidor: USER_SESSION_JWT_SECRET não configurado.",
  forbidden_wrong_church: "Você não pode alterar membros de outra igreja.",
  target_is_not_obreiro: "Ação permitida apenas para membros.",
  worker_not_found: "Membro não encontrado.",
  has_active_children: "Não é possível desativar: existem igrejas filhas ativas.",
  pastor_no_totvs_access: "Esse pastor não possui acesso a essa igreja.",
  totvs_out_of_scope: "Você não tem permissão para essa igreja.",
  cannot_release_without_pdf: "Não é possível liberar carta sem PDF pronto.",
  letter_not_released: "Carta ainda não liberada.",
  weekly_limit_reached: "Limite semanal de cartas atingido.",
  inactive_user: "Seu cadastro está bloqueado. Procure a secretaria da igreja para normalizar o cadastro.",
};

const DEFAULT_MAP: Record<ErrorContext, string> = {
  auth: "Falha ao autenticar.",
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
