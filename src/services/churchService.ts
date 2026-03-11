﻿﻿﻿import { igrejasMock } from "@/data/mockChurches";
import { supabase } from "@/lib/supabase";

type IgrejaRow = {
  totvs_id: string;
  parent_totvs_id: string | null;
  church_name: string;
  class: string | null;
};

type ChurchPastorRow = {
  totvs_id: string;
  pastor_name: string | null;
  pastor_phone: string | null;
  pastor_email: string | null;
  address_full: string | null;
};

type ChurchAssetsRow = {
  city: string | null;
};

export async function fetchChurches() {
  if (!supabase) return igrejasMock;

  // Comentário: usa a tabela nova `churches` (não usar legado `igreja`).
  const { data, error } = await supabase
    .from("churches")
    .select("totvs_id,parent_totvs_id,church_name,class");

  if (error || !Array.isArray(data)) return igrejasMock;

  return (data as IgrejaRow[]).map((d, idx) => ({
    id: Number(d.totvs_id) || idx + 1,
    codigoTotvs: d.totvs_id,
    nome: d.church_name,
    cidade: "",
    uf: "",
    carimboIgreja: "",
    carimboPastor: "",
    classificacao: d.class ?? undefined,
    parentTotvsId: d.parent_totvs_id ?? undefined,
  }));
}

type PastorInfo = {
  totvs: string;
  pastor: string | null;
  telefone: string | null;
  email?: string | null;
  endereco?: string | null;
};

export async function getPastorByTotvs(totvs: string): Promise<PastorInfo | null> {
  if (!supabase) throw new Error("supabase-not-configured");

  const t = String(totvs || "").trim();
  if (!t) return null;

  // Comentário: dados de pastor ficam vinculados na igreja ativa.
  const { data, error } = await supabase
    .from("churches")
    .select("totvs_id,pastor_name,pastor_phone,pastor_email,address_full")
    .eq("totvs_id", t)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as ChurchPastorRow;

  return {
    totvs: String(row.totvs_id || t),
    pastor: row.pastor_name || null,
    telefone: row.pastor_phone || null,
    email: row.pastor_email || null,
    endereco: row.address_full || null,
  };
}

export async function getPastorByNomeIgreja(nome: string): Promise<PastorInfo | null> {
  if (!supabase) throw new Error("supabase-not-configured");

  const n = String(nome || "").trim();
  if (!n) return null;

  const { data, error } = await supabase
    .from("churches")
    .select("totvs_id,pastor_name,pastor_phone,pastor_email,address_full")
    .eq("church_name", n)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as ChurchPastorRow;

  return {
    totvs: String(row.totvs_id || ""),
    pastor: row.pastor_name || null,
    telefone: row.pastor_phone || null,
    email: row.pastor_email || null,
    endereco: row.address_full || null,
  };
}

export async function getIgrejaAssetsByTotvs(totvs: string): Promise<{
  assinatura_url?: string | null;
  carimbo_igreja_url?: string | null;
  carimbo_pastor_url?: string | null;
  cidade?: string | null;
} | null> {
  if (!supabase) throw new Error("supabase-not-configured");

  const t = String(totvs || "").trim();
  if (!t) return null;

  // Comentário: nesta fase retornamos apenas cidade da igreja.
  const { data, error } = await supabase
    .from("churches")
    .select("city")
    .eq("totvs_id", t)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    assinatura_url: null,
    carimbo_igreja_url: null,
    carimbo_pastor_url: null,
    cidade: (data as ChurchAssetsRow).city || null,
  };
}
