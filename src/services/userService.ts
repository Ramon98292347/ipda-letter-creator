import { supabase } from "@/lib/supabase";

export async function getUsuarioByTelefone(telefone: string) {
  if (!supabase) throw new Error("supabase-not-configured");
  const { data, error } = await supabase
    .from("usuarios")
    .select("id,nome,telefone,totvs,igreja_nome,email,data_separacao,ministerial")
    .eq("telefone", telefone)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function insertUsuario(usuario: { nome: string; telefone: string; totvs?: string | null; igreja_nome?: string | null; email?: string | null; data_separacao?: string | null; ministerial?: string | null }) {
  if (!supabase) throw new Error("supabase-not-configured");
  const { data, error } = await supabase
    .from("usuarios")
    .insert([usuario])
    .select("id,nome,telefone,totvs,igreja_nome,email,data_separacao,ministerial")
    .single();
  if (error) throw error;
  return data;
}

export async function getIgrejaByTotvs(totvs: string) {
  if (!supabase) throw new Error("supabase-not-configured");
  const { data, error } = await supabase.from("igreja").select('totvs:"TOtvs", nome:"Nome da IPDA"').eq('"TOtvs"', totvs).limit(1);
  if (error) throw error;
  const row = Array.isArray(data) && data[0] ? data[0] : null;
  return row ? { codigoTotvs: row.totvs as string, nome: row.nome as string } : null;
}