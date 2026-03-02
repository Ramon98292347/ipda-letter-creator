import { supabase } from "@/lib/supabase";

type UsuarioLegacy = {
  id: string;
  nome: string;
  telefone: string;
  totvs: string | null;
  igreja_nome: string | null;
  email: string | null;
  data_separacao: string | null;
  ministerial: string | null;
  central_totvs: string | null;
  central_nome: string | null;
};

// Comentario: mantem assinatura legacy para nao quebrar telas antigas,
// mas agora consulta a tabela correta `users`.
export async function getUsuarioByTelefone(telefone: string): Promise<UsuarioLegacy | null> {
  if (!supabase) throw new Error("supabase-not-configured");

  const telDigits = (telefone || "").replace(/\D/g, "");
  if (!telDigits) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id,full_name,phone,email,minister_role,default_totvs_id")
    .eq("phone", telDigits)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const totvs = String(data.default_totvs_id || "").trim() || null;
  let igrejaNome: string | null = null;

  if (totvs) {
    const church = await getIgrejaByTotvs(totvs);
    igrejaNome = church?.nome || null;
  }

  return {
    id: String(data.id || ""),
    nome: String(data.full_name || ""),
    telefone: String(data.phone || ""),
    totvs,
    igreja_nome: igrejaNome,
    email: data.email || null,
    data_separacao: null,
    ministerial: data.minister_role || null,
    central_totvs: totvs,
    central_nome: igrejaNome,
  };
}

// Comentario: o schema atual exige CPF/role/totvs_access para criar usuario.
// Esta funcao legado nao tem esses campos.
export async function insertUsuario(_usuario: {
  nome: string;
  telefone: string;
  totvs?: string | null;
  igreja_nome?: string | null;
  email?: string | null;
  data_separacao?: string | null;
  ministerial?: string | null;
  central_totvs?: string | null;
  central_nome?: string | null;
}) {
  throw new Error("quick-register-disabled-use-create-user");
}

export async function getIgrejaByTotvs(totvs: string) {
  if (!supabase) throw new Error("supabase-not-configured");

  const { data, error } = await supabase
    .from("churches")
    .select("totvs_id, church_name")
    .eq("totvs_id", totvs)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    codigoTotvs: String(data.totvs_id),
    nome: String(data.church_name || ""),
  };
}
