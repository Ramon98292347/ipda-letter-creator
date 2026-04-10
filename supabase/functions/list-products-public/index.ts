/**
 * list-products-public
 * ====================
 * Objetivo: listar produtos ativos para a vitrine pública.
 * Como funciona:
 * - sem autenticação
 * - retorna apenas `is_active = true`
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Body = {
  church_totvs_id?: string;
};

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  };
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders() });
}

Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const churchTotvsId = String(body.church_totvs_id || "").trim();
    if (!churchTotvsId) return json({ ok: true, products: [] });

    // Consulta simples dos produtos ativos
    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data, error } = await sb
      .from("products")
      .select("*")
      .eq("church_totvs_id", churchTotvsId)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) return json({ ok: false, error: "db_error_list_products", details: "erro interno" }, 500);
    return json({ ok: true, products: data || [] });
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
