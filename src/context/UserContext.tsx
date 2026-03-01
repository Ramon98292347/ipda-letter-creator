import { createContext, useContext, useEffect, useMemo, useState } from "react";

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
  birth_date?: string | null;
  address_json?: Record<string, unknown> | null;
  ministerial?: string | null;
  data_separacao?: string | null;
  central_totvs?: string | null;
  central_nome?: string | null;
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
  const [token, setToken] = useState<string | undefined>(() => localStorage.getItem(LS_TOKEN) || undefined);
  const [session, setSession] = useState<AppSession | undefined>(() => {
    try {
      const raw = localStorage.getItem(LS_SESSION);
      if (!raw) return undefined;
      return JSON.parse(raw) as AppSession;
    } catch {
      return undefined;
    }
  });
  const [pendingCpf, setPendingCpf] = useState<string | undefined>(() => localStorage.getItem(LS_PENDING_CPF) || undefined);
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

  useEffect(() => {
    if (usuario) localStorage.setItem(LS_USER, JSON.stringify(usuario));
    else localStorage.removeItem(LS_USER);
  }, [usuario]);

  useEffect(() => {
    if (token) localStorage.setItem(LS_TOKEN, token);
    else localStorage.removeItem(LS_TOKEN);
  }, [token]);

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
