// supabase/functions/list-announcements-public/index.ts
// Retorna anúncios ativos para uma ou mais igrejas SEM exigir autenticação.
// Usa service_role_key para bypassar RLS — só expõe registros is_active = true.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

type Body = {
  totvs_id?: string;         // uma única igreja
  totvs_ids?: string[];      // múltiplas igrejas (ex: escopo do admin)
  limit?: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    // Monta lista de totvs_ids
    const rawIds: string[] = [];
    if (body.totvs_id) rawIds.push(String(body.totvs_id).trim());
    if (Array.isArray(body.totvs_ids)) {
      for (const id of body.totvs_ids) {
        const s = String(id || "").trim();
        if (s) rawIds.push(s);
      }
    }
    const totvsList = [...new Set(rawIds)].filter(Boolean);
    if (!totvsList.length) return json({ ok: true, announcements: [] });

    const limit = Math.max(1, Math.min(30, Number(body.limit || 10)));

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data, error } = await sb
      .from("announcements")
      .select("id, church_totvs_id, title, type, body_text, media_url, link_url, position, starts_at, ends_at, is_active, created_at")
      .in("church_totvs_id", totvsList)
      .eq("is_active", true)
      .order("position", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return json({ ok: false, error: "db_error", details: error.message }, 500);

    const now = Date.now();
    const announcements = (data || []).filter((a: Record<string, unknown>) => {
      const startsOk = !a.starts_at || new Date(String(a.starts_at)).getTime() <= now;
      const endsOk = !a.ends_at || new Date(String(a.ends_at)).getTime() >= now;
      return startsOk && endsOk;
    });

    return json({ ok: true, announcements });
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
