import { igrejasMock } from "@/data/mockChurches";
import { supabase } from "@/lib/supabase";

type IgrejaRow = {
  totvs: string;
  nome: string;
  classificacao: string | null;
};

export async function fetchChurches() {
  if (!supabase) return igrejasMock;
  const { data, error } = await supabase
    .from("igreja")
    .select('totvs:"TOtvs", nome:"Nome da IPDA", classificacao:"Classificacao"');
  if (error || !Array.isArray(data)) return igrejasMock;
  return (data as IgrejaRow[]).map((d, idx) => ({
    id: Number(d.totvs) || idx + 1,
    codigoTotvs: d.totvs,
    nome: d.nome,
    cidade: "",
    uf: "",
    carimboIgreja: "",
    carimboPastor: "",
    classificacao: d.classificacao ?? undefined,
  }));
}

export async function getPastorByTotvs(totvs: string) {
  if (!supabase) throw new Error("supabase-not-configured");
  const { data, error } = await supabase
    .from("igreja")
    .select('totvs:"TOtvs", pastor:"Nome completo do Pastor", telefone:"Telefone"')
    .eq('"TOtvs"', totvs)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { totvs: (data as any).totvs as string, pastor: (data as any).pastor as string | null, telefone: (data as any).telefone as string | null };
}
