import { getToken as getAuthToken, logout } from "@/lib/api";

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

export function getFriendlyErrorMessage(err: unknown): string {
  const isTypedError = err instanceof ApiError;
  const message = String((err as { message?: string } | null)?.message || "");

  if (!isTypedError) {
    if (message.toLowerCase().includes("failed to fetch")) {
      return "Falha de conexao. Verifique sua internet e tente novamente.";
    }
    return message || "Ocorreu um erro inesperado.";
  }

  const status = err.status;
  const data = err.data || {};
  const code = String(data.error || "");
  const detail = String(data.detail || data.details || "");
  const maxDate = String(data.max_date || "");
  const period = String(data.preach_period || "");

  if (status === 401) return "Sessao expirada. Faca login novamente.";

  if (status === 403) {
    if (code === "weekly_limit_reached") return "Limite semanal atingido: maximo de 5 cartas nos ultimos 7 dias.";
    if (code === "setorial_cannot_issue_to_estadual") {
      return "Voce nao pode tirar carta para uma classe acima de voce. Procure o pastor da igreja mae.";
    }
    if (code === "central_cannot_issue_to_estadual_or_setorial") {
      return "Voce nao pode tirar carta para classes acima de voce (Estadual/Setorial). Procure o pastor da igreja mae.";
    }
    if (code === "forbidden") return "Voce nao tem permissao para executar esta acao.";
    if (code === "unauthorized") return "Sessao expirada. Faca login novamente.";
    return detail || "Voce nao pode tirar carta para uma classe acima de voce.";
  }

  if (status === 409) {
    if (code.includes("duplicate_letter")) {
      const p = period ? ` (${period})` : "";
      return `Ja existe uma carta para este pregador nesta data e horario${p}. Altere o horario ou a data.`;
    }
    return detail || "Conflito: ja existe um registro com estes dados.";
  }

  if (status === 400) {
    switch (code) {
      case "missing_preacher_name":
        return "Informe o nome do pregador.";
      case "missing_minister_role":
        return "Selecione o cargo ministerial.";
      case "missing_preach_date":
        return "Informe a data da pregacao.";
      case "invalid_preach_date_format":
        return "Data invalida. Use o formato correto.";
      case "preach_date_in_past":
        return "Nao e permitido criar carta com data no passado.";
      case "preach_date_out_of_current_month":
        return `A data deve estar dentro do mes vigente. Maximo: ${maxDate || "fim do mes"}.`;
      case "missing_church_origin":
        return "Informe a igreja de origem.";
      case "missing_church_destination":
        return "Informe a igreja de destino.";
      case "destination_totvs_required":
        return "Escolha a igreja destino usando uma opcao com codigo TOTVS valido.";
      case "invalid_preach_period":
        return "Selecione o horario da pregacao: Manha, Tarde ou Noite.";
      case "insert_failed":
        return "Nao foi possivel salvar a carta. Verifique os dados e tente novamente.";
      default:
        return detail || "Dados invalidos. Verifique e tente novamente.";
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
    const token = getAuthToken();
    if (!token) {
      logout();
      throw new ApiError("missing_token", 401, { error: "missing_token" });
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as ApiErrorData;
  if (!res.ok || data?.ok === false) {
    const code = String(data?.error || "");
    // Comentario: evita deslogar automaticamente por 401 de regra de negocio.
    // Mantemos logout automatico apenas para token explicitamente invalido/ausente.
    if (code === "invalid_token_payload" || code === "missing_token") {
      logout();
    }
    throw new ApiError(String(data?.error || `http_${res.status}`), res.status, data);
  }

  return data as unknown as T;
}
