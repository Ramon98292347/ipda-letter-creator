import { createContext, useContext, useMemo, useState } from "react";

export type Usuario = {
  id?: number;
  nome: string;
  telefone: string;
  totvs?: string | null;
  igreja_nome?: string | null;
  email?: string | null;
  ministerial?: string | null;
  data_separacao?: string | null;
};

type UserState = {
  usuario?: Usuario;
  setUsuario: (u?: Usuario) => void;
  telefone?: string;
  setTelefone: (t?: string) => void;
};

const Ctx = createContext<UserState | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | undefined>(undefined);
  const [telefone, setTelefone] = useState<string | undefined>(undefined);
  const value = useMemo(() => ({ usuario, setUsuario, telefone, setTelefone }), [usuario, telefone]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUser() {
  const c = useContext(Ctx);
  if (!c) throw new Error("user-ctx");
  return c;
}