type ApiErrorData = {
  ok?: boolean;
  error?: string;
  detail?: string;
  details?: string;
  max_date?: string;
  preach_period?: string;
  [key: string]: unknown;
};

export class ApiError extends Error {
  status: number;
  data?: ApiErrorData;

  constructor(message: string, status: number, data?: ApiErrorData) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function getToken() {
  const raw = String(localStorage.getItem("ipda_token") || "")
    .replace(/^Bearer\s+/i, "")
    .trim()
    .replace(/^"+|"+$/g, "");
  if (!raw) return "";
  const parts = raw.split(".");
  if (parts.length !== 3) return "";
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const data = JSON.parse(atob(padded));
    if (!data?.sub || !data?.role || !data?.active_totvs_id) return "";
    return raw;
  } catch {
    return "";
  }
}

export function getFriendlyErrorMessage(err: unknown): string {
  // Comentario: compatibilidade com erros de fetch e erros tipados da API.
  const isTypedError = err instanceof ApiError;
  const message = String((err as { message?: string } | null)?.message || "");

  if (!isTypedError) {
    if (message.toLowerCase().includes("failed to fetch")) {
      return "Falha de conexão. Verifique sua internet e tente novamente.";
    }
    return message || "Ocorreu um erro inesperado.";
  }

  const status = err.status;
  const data = err.data || {};
  const code = String(data.error || "");
  const detail = String(data.detail || data.details || "");
  const maxDate = String(data.max_date || "");
  const period = String(data.preach_period || "");

  if (status === 401) return "Sessão expirada. Faça login novamente.";

  if (status === 403) {
    if (code === "weekly_limit_reached") return "Limite semanal atingido: máximo de 5 cartas nos últimos 7 dias.";
    if (code === "forbidden") return "Você não tem permissão para executar esta ação.";
    if (code === "unauthorized") return "Sessão expirada. Faça login novamente.";
    return detail || "Acesso negado.";
  }

  if (status === 409) {
    if (code.includes("duplicate_letter")) {
      const p = period ? ` (${period})` : "";
      return `Já existe uma carta para este pregador nesta data e horário${p}. Altere o horário ou a data.`;
    }
    return detail || "Conflito: já existe um registro com estes dados.";
  }

  if (status === 400) {
    switch (code) {
      case "missing_preacher_name":
        return "Informe o nome do pregador.";
      case "missing_minister_role":
        return "Selecione o cargo ministerial.";
      case "missing_preach_date":
        return "Informe a data da pregação.";
      case "invalid_preach_date_format":
        return "Data inválida. Use o formato correto.";
      case "preach_date_in_past":
        return "Não é permitido criar carta com data no passado.";
      case "preach_date_out_of_current_month":
        return `A data deve estar dentro do mês vigente. Máximo: ${maxDate || "fim do mês"}.`;
      case "missing_church_origin":
        return "Informe a igreja de origem.";
      case "missing_church_destination":
        return "Informe a igreja de destino.";
      case "invalid_preach_period":
        return "Selecione o horário da pregação: Manhã, Tarde ou Noite.";
      case "insert_failed":
        return "Não foi possível salvar a carta. Verifique os dados e tente novamente.";
      default:
        return detail || "Dados inválidos. Verifique e tente novamente.";
    }
  }

  if (status >= 500) return "Erro interno no servidor. Tente novamente em instantes.";
  return detail || message || "Ocorreu um erro.";
}

export async function apiFetch<T>(
  path: string,
  body?: Record<string, unknown> | null,
  options?: { method?: string; noAuth?: boolean }
): Promise<T> {
  const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
  const method = options?.method || "POST";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };

  if (!options?.noAuth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as ApiErrorData;
  if (!res.ok || data?.ok === false) {
    throw new ApiError(String(data?.error || `http_${res.status}`), res.status, data);
  }

  return data as unknown as T;
}
