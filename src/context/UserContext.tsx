import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export type Usuario = {
  id?: number | string;
  nome: string;
  full_name?: string | null;
  telefone: string;
  cpf?: string | null;
  role?: "admin" | "pastor" | "obreiro" | "secretario" | "financeiro" | null;
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
  ministerial?: string | null;
  data_separacao?: string | null;
  central_totvs?: string | null;
  central_nome?: string | null;
  registration_status?: "APROVADO" | "PENDENTE" | null;
  can_create_released_letter?: boolean | null;
};

export type AppSession = {
  totvs_id: string;
  root_totvs_id?: string;
  role: "admin" | "pastor" | "obreiro" | "secretario" | "financeiro";
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
const LS_RLS_TOKEN = "ipda_rls_token";
const LS_SESSION = "ipda_session";
const LS_PENDING_CPF = "ipda_pending_cpf";
const LS_CHURCHES = "ipda_pending_churches";
const AUTH_CLEARED_EVENT = "ipda-auth-cleared";

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

function parseJwtExp(jwt: string) {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json?.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | undefined>(() => {
    try {
      const raw = localStorage.getItem(LS_USER);
      if (!raw) return undefined;
      return JSON.parse(raw) as Usuario;
    } catch {
      return undefined;
    }
  });
  const [token, setToken] = useState<string | undefined>(() => {
    return normalizeJwtToken(localStorage.getItem(LS_TOKEN));
  });
  const [session, setSession] = useState<AppSession | undefined>(() => {
    try {
      const raw = localStorage.getItem(LS_SESSION);
      if (!raw) return undefined;
      return JSON.parse(raw) as AppSession;
    } catch {
      return undefined;
    }
  });
  const [pendingCpf, setPendingCpf] = useState<string | undefined>(() => {
    return localStorage.getItem(LS_PENDING_CPF) || undefined;
  });
  const [availableChurches, setAvailableChurches] = useState<PendingChurch[]>(() => {
    try {
      const raw = localStorage.getItem(LS_CHURCHES);
      if (!raw) return [];
      return JSON.parse(raw) as PendingChurch[];
    } catch {
      return [];
    }
  });
  const [telefone, setTelefone] = useState<string | undefined>(undefined);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) return;

    const exp = parseJwtExp(token);
    if (!exp) return;
    const nowSec = Math.floor(Date.now() / 1000);
    const msToExpire = (exp - nowSec) * 1000;
    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    const handleOnlineResume = () => {
      const refreshedExp = parseJwtExp(token);
      const refreshedNow = Math.floor(Date.now() / 1000);
      if (refreshedExp && refreshedExp <= refreshedNow) {
        toast.error("Sessão offline expirou. Faça login novamente.");
        clearAuth();
      }
    };

    if (msToExpire <= 0) {
      if (isOffline) {
        toast.message("Modo offline ativo com sessão local salva neste aparelho.");
        window.addEventListener("online", handleOnlineResume);
        return () => window.removeEventListener("online", handleOnlineResume);
      }
      toast.error("Sessão expirada. Faça login novamente.");
      clearAuth();
      return;
    }

    const warnAt = msToExpire - 2 * 60 * 1000;
    let warnTimer: ReturnType<typeof setTimeout> | undefined;
    if (warnAt > 0) {
      warnTimer = setTimeout(() => toast.message("Sua sessão expira em menos de 2 minutos."), warnAt);
    }
    const logoutTimer = setTimeout(() => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        toast.message("Sessão mantida offline. Ao voltar a internet, será necessário entrar novamente.");
        return;
      }
      toast.error("Sessão expirada. Faça login novamente.");
      clearAuth();
    }, msToExpire);
    window.addEventListener("online", handleOnlineResume);

    return () => {
      if (warnTimer) clearTimeout(warnTimer);
      clearTimeout(logoutTimer);
      window.removeEventListener("online", handleOnlineResume);
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
    queryClient.clear();
    setUsuario(undefined);
    setToken(undefined);
    localStorage.removeItem(LS_RLS_TOKEN);
    setSession(undefined);
    setPendingCpf(undefined);
    setAvailableChurches([]);
    setTelefone(undefined);
  }

  // Comentario: faz logout automatico apos 30 minutos de inatividade do usuario.
  // Reseta o timer a cada clique, tecla ou movimento do mouse.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!token) return;
    const IDLE_MS = 30 * 60 * 1000; // 30 minutos em milissegundos
    let idleTimer: ReturnType<typeof setTimeout>;

    function resetTimer() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        clearAuth();
      }, IDLE_MS);
    }

    const events = ["click", "keydown", "mousemove", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      clearTimeout(idleTimer);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [token]); // Comentario: clearAuth omitido das deps pois e redefinido a cada render.

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

