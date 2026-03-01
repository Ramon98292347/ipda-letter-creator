export type Session = {
  totvs_id: string;
  root_totvs_id?: string;
  role: "admin" | "pastor" | "obreiro";
  church_name: string;
  church_class?: string;
  scope_totvs_ids?: string[];
};

export type LoggedUser = {
  id: string;
  full_name: string;
  cpf: string;
  role: "admin" | "pastor" | "obreiro";
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string;
const FUNCTIONS_BASE = `${SUPABASE_URL?.replace(/\/$/, "")}/functions/v1`;

const TOKEN_KEY = "ipda_token";
const SESSION_KEY = "ipda_session";
const USER_KEY = "ipda_user";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
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
  clearSession();
  clearUser();
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: any;

  constructor(message: string, status: number, code?: string, details?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function parseJsonSafe(res: Response) {
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    return { raw: txt };
  }
}

export async function post<T = any>(fnName: string, body: any = {}, opts?: { skipAuth?: boolean }): Promise<T> {
  const url = `${FUNCTIONS_BASE}/${fnName}`;
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (SUPABASE_ANON_KEY) {
    headers["apikey"] = SUPABASE_ANON_KEY;
  }

  if (!opts?.skipAuth) {
    if (!token) {
      throw new ApiError("Sem token. Faça login novamente.", 401, "missing_token");
    }
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });

  const data = await parseJsonSafe(res);

  if (!res.ok || data?.ok === false) {
    const code = data?.error || "api_error";
    const msg = data?.detail || data?.message || (typeof data === "string" ? data : "Erro na requisição");
    if (res.status === 401) logout();
    throw new ApiError(msg, res.status, code, data);
  }

  return data as T;
}
