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
  class?: string;
  parent_totvs_id?: string;
  query?: string;
  limit?: number;
  include_all?: boolean;
};

function onlyDigits(value: string) {
  return String(value || "").replace(/\D+/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const classFilter = String(body.class || "").trim();
    const parentTotvsId = String(body.parent_totvs_id || "").trim();
    const rawQuery = String(body.query || "").trim();
    const queryDigits = onlyDigits(rawQuery);
    const limit = Math.max(1, Math.min(1000, Number(body.limit || 50)));

    const includeAll = Boolean(body.include_all);
    if (!includeAll && !classFilter && !parentTotvsId && rawQuery.length < 2 && queryDigits.length < 2) {
      return json({ ok: true, churches: [] }, 200);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    let query = sb
      .from("churches")
      .select("id, totvs_id, church_name, class, parent_totvs_id, is_active")
      .eq("is_active", true);

    if (classFilter) query = query.eq("class", classFilter);
    if (parentTotvsId) query = query.eq("parent_totvs_id", parentTotvsId);

    if (rawQuery.length >= 2 || queryDigits.length >= 2) {
      if (queryDigits.length >= 2 && rawQuery.length >= 2) {
        query = query.or(`totvs_id.ilike.${queryDigits}%,church_name.ilike.%${rawQuery}%`);
      } else if (queryDigits.length >= 2) {
        query = query.ilike("totvs_id", `${queryDigits}%`);
      } else {
        query = query.ilike("church_name", `%${rawQuery}%`);
      }
    }

    const { data, error } = await query
      .order("church_name", { ascending: true })
      .limit(limit);

    if (error) return json({ ok: false, error: "db_error_list_churches", details: "erro interno" }, 500);

    return json({
      ok: true,
      churches: (data || []).map((row) => ({
        id: String(row.id || ""),
        totvs_id: String(row.totvs_id || ""),
        church_name: String(row.church_name || ""),
        class: String(row.class || ""),
        parent_totvs_id: row.parent_totvs_id ? String(row.parent_totvs_id) : null,
        is_active: Boolean(row.is_active),
      })),
    });
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
