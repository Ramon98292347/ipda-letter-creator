import { supabase } from "@/lib/supabase";

type IgrejaRow = { totvs: string; nome: string; classificacao: string | null };

export async function fetchCentralChurches() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("igreja")
    .select('totvs:"TOtvs", nome:"Nome da IPDA", classificacao:"Classificacao"');
  if (error || !Array.isArray(data)) return [];
  const rows = data as any as IgrejaRow[];
  const isTarget = (c: string | null) => {
    const s = (c || "").toLowerCase();
    return s.includes("central") || s.includes("setorial") || s.includes("estadual");
  };
  return rows
    .filter((d) => isTarget(d.classificacao))
    .map((d, idx) => ({
      id: Number(d.totvs) || idx + 1,
      codigoTotvs: d.totvs,
      nome: d.nome,
      cidade: "",
      uf: "",
      carimboIgreja: "",
      carimboPastor: "",
    }));
}