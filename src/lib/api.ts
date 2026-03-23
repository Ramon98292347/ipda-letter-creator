export type Session = {
  totvs_id: string;
  root_totvs_id?: string;
  role: "admin" | "pastor" | "obreiro" | "secretario" | "financeiro";
  church_name: string;
  church_class?: string;
  scope_totvs_ids?: string[];
};

export type LoggedUser = {
  id: string;
  full_name: string;
  cpf: string;
  role: "admin" | "pastor" | "obreiro" | "secretario" | "financeiro";
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string;
const FUNCTIONS_BASE = `${SUPABASE_URL?.replace(/\/$/, "")}/functions/v1`;

const TOKEN_KEY = "ipda_token";
const RLS_TOKEN_KEY = "ipda_rls_token";

// Flag de sessao: quando o rls_token recebe 401, marca como quebrado para que
// todas as queries concorrentes ja caiam no fallback sem disparar mais requests invalidos.
let rlsTokenBroken = false;
const SESSION_KEY = "ipda_session";
const USER_KEY = "ipda_user";
const AUTH_CLEARED_EVENT = "ipda-auth-cleared";

function normalizeToken(raw: string) {
  return raw.replace(/^Bearer\s+/i, "").trim().replace(/^"+|"+$/g, "");
}

function isJwtLike(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const json = JSON.parse(atob(padded));
    return Boolean(json?.sub && json?.role && json?.active_totvs_id);
  } catch {
    return false;
  }
}

export function getToken(): string | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  const token = normalizeToken(raw);
  if (!token || !isJwtLike(token)) return null;
  return token;
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, normalizeToken(token));
}

export function getRlsToken(): string | null {
  if (rlsTokenBroken) return null;
  const raw = localStorage.getItem(RLS_TOKEN_KEY);
  if (!raw) return null;
  const token = normalizeToken(raw);
  if (!token || token.split(".").length !== 3) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload?.exp && Date.now() / 1000 >= payload.exp) {
      localStorage.removeItem(RLS_TOKEN_KEY);
      return null;
    }
  } catch {
    // token malformado, deixa passar — receberá 401 e será limpo
  }
  return token;
}

export function setRlsToken(token?: string | null) {
  rlsTokenBroken = false; // novo token: reseta o flag
  const normalized = normalizeToken(String(token || ""));
  if (!normalized || normalized.split(".").length !== 3) {
    localStorage.removeItem(RLS_TOKEN_KEY);
    return;
  }
  localStorage.setItem(RLS_TOKEN_KEY, normalized);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function clearRlsToken() {
  rlsTokenBroken = true; // marca imediatamente para parar queries concorrentes
  localStorage.removeItem(RLS_TOKEN_KEY);
}

export function getSession(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function setSession(session: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function getUser(): LoggedUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LoggedUser;
  } catch {
    return null;
  }
}

export function setUser(user: LoggedUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearUser() {
  localStorage.removeItem(USER_KEY);
}

export function logout() {
  clearToken();
  clearRlsToken();
  clearSession();
  clearUser();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_CLEARED_EVENT));
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const txt = await res.text();
  try {
    return JSON.parse(txt) as Record<string, unknown>;
  } catch {
    return { raw: txt };
  }
}

// Tempo máximo de espera por uma chamada de Edge Function: 30 segundos.
// Sem isso, se o Supabase travar, a tela fica em loading indefinidamente.
const API_TIMEOUT_MS = 30_000;

export async function post<T = unknown>(
  fnName: string,
  body: Record<string, unknown> = {},
  opts?: { skipAuth?: boolean }
): Promise<T> {
  const url = `${FUNCTIONS_BASE}/${fnName}`;
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (SUPABASE_ANON_KEY) {
    headers.apikey = SUPABASE_ANON_KEY;
  }

  if (!opts?.skipAuth) {
    if (!token) {
      logout();
      throw new ApiError("Sessão expirada. Faça login novamente.", 401, "missing_token");
    }
    if (!isJwtLike(token)) {
      logout();
      throw new ApiError("Token de sessão inválido. Faça login novamente.", 401, "invalid_token_format");
    }
    headers.Authorization = `Bearer ${token}`;
  }

  // AbortController permite cancelar o fetch depois do prazo máximo.
  // Se a Edge Function não responder em 30s, o request é abortado e
  // o catch da chamada recebe um erro com mensagem amigável.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
  } catch (err) {
    // AbortError = timeout estourou; outros erros = sem rede
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError(
        "O servidor demorou demais para responder. Verifique sua conexão e tente novamente.",
        408,
        "request_timeout",
      );
    }
    throw new ApiError(
      "Sem conexão com a internet. Verifique sua rede e tente novamente.",
      0,
      "network_error",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await parseJsonSafe(res);

  if (!res.ok || data.ok === false) {
    const code = String(data.error || "api_error");
    const msg =
      String(data.detail || data.message || "") ||
      (typeof data === "string" ? data : "Erro na requisição");

    // Comentario: evita derrubar sessao por 401 de endpoint especifico.
    // Faz logout apenas quando o backend indicar token realmente invalido/ausente.
    if (code === "invalid_token_payload" || code === "missing_token") {
      logout();
    }

    throw new ApiError(msg, res.status, code, data);
  }

  return data as T;
}

