import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export type Usuario = {
  id?: number | string;
  nome: string;
  full_name?: string | null;
  telefone: string;
  cpf?: string | null;
  role?: "admin" | "pastor" | "obreiro" | null;
  totvs?: string | null;
  default_totvs_id?: string | null;
  church_name?: string | null;
  church_class?: string | null;
  totvs_access?: string[] | null;
  is_active?: boolean | null;
  igreja_nome?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  birth_date?: string | null;
  address_json?: Record<string, unknown> | null;
  ministerial?: string | null;
  data_separacao?: string | null;
  central_totvs?: string | null;
  central_nome?: string | null;
  registration_status?: "APROVADO" | "PENDENTE" | null;
};

export type AppSession = {
  totvs_id: string;
  root_totvs_id?: string;
  role: "admin" | "pastor" | "obreiro";
  church_name: string;
  church_class?: string | null;
  scope_totvs_ids: string[];
};

export type PendingChurch = {
  totvs_id: string;
  church_name: string;
  church_class?: string | null;
};

type UserState = {
  usuario?: Usuario;
  setUsuario: (u?: Usuario) => void;
  token?: string;
  setToken: (t?: string) => void;
  session?: AppSession;
  setSession: (s?: AppSession) => void;
  pendingCpf?: string;
  setPendingCpf: (cpf?: string) => void;
  availableChurches: PendingChurch[];
  setAvailableChurches: (items: PendingChurch[]) => void;
  telefone?: string;
  setTelefone: (t?: string) => void;
  clearAuth: () => void;
};

const Ctx = createContext<UserState | undefined>(undefined);

const LS_USER = "ipda_user";
const LS_TOKEN = "ipda_token";
const LS_SESSION = "ipda_session";
const LS_PENDING_CPF = "ipda_pending_cpf";
const LS_CHURCHES = "ipda_pending_churches";
const AUTH_CLEARED_EVENT = "ipda-auth-cleared";
const LAST_PATH_BEFORE_RELOAD = "ipda_last_path_before_reload";

function normalizeJwtToken(raw?: string | null): string | undefined {
  const value = String(raw || "")
    .replace(/^Bearer\s+/i, "")
    .trim()
    .replace(/^"+|"+$/g, "");
  if (!value || value === "undefined" || value === "null") return undefined;
  const parts = value.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const data = JSON.parse(atob(padded));
    if (!data?.sub || !data?.role || !data?.active_totvs_id) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const shouldForceLoginOnReload =
    typeof window !== "undefined" &&
    (() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      return nav?.type === "reload";
    })();

  const [usuario, setUsuario] = useState<Usuario | undefined>(() => {
    if (shouldForceLoginOnReload) return undefined;
    try {
      const raw = localStorage.getItem(LS_USER);
      if (!raw) return undefined;
      return JSON.parse(raw) as Usuario;
    } catch {
      return undefined;
    }
  });
  const [token, setToken] = useState<string | undefined>(() => {
    if (shouldForceLoginOnReload) return undefined;
    return normalizeJwtToken(localStorage.getItem(LS_TOKEN));
  });
  const [session, setSession] = useState<AppSession | undefined>(() => {
    if (shouldForceLoginOnReload) return undefined;
    try {
      const raw = localStorage.getItem(LS_SESSION);
      if (!raw) return undefined;
      return JSON.parse(raw) as AppSession;
    } catch {
      return undefined;
    }
  });
  const [pendingCpf, setPendingCpf] = useState<string | undefined>(() => {
    if (shouldForceLoginOnReload) return undefined;
    return localStorage.getItem(LS_PENDING_CPF) || undefined;
  });
  const [availableChurches, setAvailableChurches] = useState<PendingChurch[]>(() => {
    if (shouldForceLoginOnReload) return [];
    try {
      const raw = localStorage.getItem(LS_CHURCHES);
      if (!raw) return [];
      return JSON.parse(raw) as PendingChurch[];
    } catch {
      return [];
    }
  });
  const [telefone, setTelefone] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!shouldForceLoginOnReload || typeof window === "undefined") return;

    localStorage.removeItem(LS_USER);
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_SESSION);
    localStorage.removeItem(LS_PENDING_CPF);
    localStorage.removeItem(LS_CHURCHES);
    localStorage.removeItem(LAST_PATH_BEFORE_RELOAD);
    setTelefone(undefined);
  }, [shouldForceLoginOnReload]);

  useEffect(() => {
    if (!token) return;

    function parseExp(jwt: string) {
      try {
        const payload = jwt.split(".")[1];
        if (!payload) return null;
        const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
        return typeof json?.exp === "number" ? json.exp : null;
      } catch {
        return null;
      }
    }

    const exp = parseExp(token);
    if (!exp) return;
    const nowSec = Math.floor(Date.now() / 1000);
    const msToExpire = (exp - nowSec) * 1000;
    if (msToExpire <= 0) {
      toast.error("Sessao expirada. Faca login novamente.");
      clearAuth();
      return;
    }

    const warnAt = msToExpire - 2 * 60 * 1000;
    let warnTimer: ReturnType<typeof setTimeout> | undefined;
    if (warnAt > 0) {
      warnTimer = setTimeout(() => toast.message("Sua sessao expira em menos de 2 minutos."), warnAt);
    }
    const logoutTimer = setTimeout(() => {
      toast.error("Sessao expirada. Faca login novamente.");
      clearAuth();
    }, msToExpire);

    return () => {
      if (warnTimer) clearTimeout(warnTimer);
      clearTimeout(logoutTimer);
    };
  }, [token]);

  useEffect(() => {
    if (usuario) localStorage.setItem(LS_USER, JSON.stringify(usuario));
    else localStorage.removeItem(LS_USER);
  }, [usuario]);

  useEffect(() => {
    if (token) localStorage.setItem(LS_TOKEN, token);
    else localStorage.removeItem(LS_TOKEN);
  }, [token]);

  useEffect(() => {
    function onAuthCleared() {
      clearAuth();
    }
    window.addEventListener(AUTH_CLEARED_EVENT, onAuthCleared);
    return () => window.removeEventListener(AUTH_CLEARED_EVENT, onAuthCleared);
  }, []);

  useEffect(() => {
    if (session) localStorage.setItem(LS_SESSION, JSON.stringify(session));
    else localStorage.removeItem(LS_SESSION);
  }, [session]);

  useEffect(() => {
    if (pendingCpf) localStorage.setItem(LS_PENDING_CPF, pendingCpf);
    else localStorage.removeItem(LS_PENDING_CPF);
  }, [pendingCpf]);

  useEffect(() => {
    if (availableChurches.length) localStorage.setItem(LS_CHURCHES, JSON.stringify(availableChurches));
    else localStorage.removeItem(LS_CHURCHES);
  }, [availableChurches]);

  function clearAuth() {
    setUsuario(undefined);
    setToken(undefined);
    setSession(undefined);
    setPendingCpf(undefined);
    setAvailableChurches([]);
    setTelefone(undefined);
  }

  const value = useMemo(
    () => ({
      usuario,
      setUsuario,
      token,
      setToken,
      session,
      setSession,
      pendingCpf,
      setPendingCpf,
      availableChurches,
      setAvailableChurches,
      telefone,
      setTelefone,
      clearAuth,
    }),
    [usuario, token, session, pendingCpf, availableChurches, telefone],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUser() {
  const c = useContext(Ctx);
  if (!c) throw new Error("user-ctx");
  return c;
}
