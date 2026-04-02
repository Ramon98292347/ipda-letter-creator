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
  church_totvs_id?: string;
};

type Contact = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const churchTotvsId = String(body.church_totvs_id || "").trim();
    if (!churchTotvsId) return json({ ok: false, error: "missing_church_totvs_id" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data: churchRow, error: churchErr } = await sb
      .from("churches")
      .select("totvs_id, pastor_user_id")
      .eq("totvs_id", churchTotvsId)
      .maybeSingle();

    if (churchErr) return json({ ok: false, error: "db_error_church", details: churchErr.message }, 500);
    if (!churchRow) return json({ ok: false, error: "church_not_found" }, 404);

    let pastor: Contact | null = null;
    const pastorId = String(churchRow.pastor_user_id || "").trim();
    if (pastorId) {
      const { data: pastorRow, error: pastorErr } = await sb
        .from("users")
        .select("id, full_name, phone, email")
        .eq("id", pastorId)
        .eq("is_active", true)
        .maybeSingle();
      if (pastorErr) return json({ ok: false, error: "db_error_pastor", details: pastorErr.message }, 500);
      if (pastorRow) {
        pastor = {
          id: String(pastorRow.id || ""),
          full_name: String(pastorRow.full_name || ""),
          phone: pastorRow.phone ? String(pastorRow.phone) : null,
          email: pastorRow.email ? String(pastorRow.email) : null,
        };
      }
    }

    const { data: secretarioRows, error: secretarioErr } = await sb
      .from("users")
      .select("id, full_name, phone, email")
      .eq("role", "secretario")
      .eq("default_totvs_id", churchTotvsId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (secretarioErr) return json({ ok: false, error: "db_error_secretary", details: secretarioErr.message }, 500);

    const firstSecretary = (secretarioRows || [])[0] as Record<string, unknown> | undefined;
    const secretary: Contact | null = firstSecretary
      ? {
        id: String(firstSecretary.id || ""),
        full_name: String(firstSecretary.full_name || ""),
        phone: firstSecretary.phone ? String(firstSecretary.phone) : null,
        email: firstSecretary.email ? String(firstSecretary.email) : null,
      }
      : null;

    return json({
      ok: true,
      church_totvs_id: churchTotvsId,
      pastor,
      secretary,
    });
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
