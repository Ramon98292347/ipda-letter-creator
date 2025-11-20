import { supabase } from "@/lib/supabase";

export async function getUsuarioByTelefone(telefone: string) {
  if (!supabase) throw new Error("supabase-not-configured");
  const telDigits = (telefone || "").replace(/\D/g, "");
  const baseSelect = "id,nome,telefone,totvs,igreja_nome,email,data_separacao,ministerial,central_totvs,central_nome";
  const q = supabase.from("usuarios");
  const { data, error } = await q
    .select(baseSelect)
    .eq("telefone", telDigits)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function insertUsuario(usuario: { nome: string; telefone: string; totvs?: string | null; igreja_nome?: string | null; email?: string | null; data_separacao?: string | null; ministerial?: string | null; central_totvs?: string | null; central_nome?: string | null }) {
  if (!supabase) throw new Error("supabase-not-configured");
  const table = supabase.from("usuarios");
  const { data, error } = await table
    .insert([usuario])
    .select("id,nome,telefone,totvs,igreja_nome,email,data_separacao,ministerial,central_totvs,central_nome")
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