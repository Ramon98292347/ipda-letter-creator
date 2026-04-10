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

function hasTotvsAccess(totvsAccess: unknown, churchTotvsId: string): boolean {
  if (!Array.isArray(totvsAccess)) return false;
  for (const entry of totvsAccess) {
    if (typeof entry === "string" && String(entry).trim() === churchTotvsId) return true;
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    if (String(item.totvs_id || "").trim() === churchTotvsId) return true;
  }
  return false;
}

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

    if (churchErr) return json({ ok: false, error: "db_error_church", details: "erro interno" }, 500);
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
      if (pastorErr) return json({ ok: false, error: "db_error_pastor", details: "erro interno" }, 500);
      if (pastorRow) {
        pastor = {
          id: String(pastorRow.id || ""),
          full_name: String(pastorRow.full_name || ""),
          phone: pastorRow.phone ? String(pastorRow.phone) : null,
          email: pastorRow.email ? String(pastorRow.email) : null,
        };
      }
    }

    if (!pastor) {
      const { data: fallbackPastorRows, error: fallbackPastorErr } = await sb
        .from("users")
        .select("id, full_name, phone, email")
        .eq("role", "pastor")
        .eq("default_totvs_id", churchTotvsId)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (fallbackPastorErr) return json({ ok: false, error: "db_error_pastor_fallback", details: "erro interno" }, 500);
      const firstPastor = (fallbackPastorRows || [])[0] as Record<string, unknown> | undefined;
      if (firstPastor) {
        pastor = {
          id: String(firstPastor.id || ""),
          full_name: String(firstPastor.full_name || ""),
          phone: firstPastor.phone ? String(firstPastor.phone) : null,
          email: firstPastor.email ? String(firstPastor.email) : null,
        };
      }
    }

    const { data: secretarioRows, error: secretarioErr } = await sb
      .from("users")
      .select("id, full_name, phone, email, default_totvs_id, totvs_access")
      .eq("role", "secretario")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (secretarioErr) return json({ ok: false, error: "db_error_secretary", details: "erro interno" }, 500);

    const firstSecretary = (secretarioRows || []).find((row) => {
      const item = row as Record<string, unknown>;
      const defaultTotvs = String(item.default_totvs_id || "").trim();
      if (defaultTotvs === churchTotvsId) return true;
      return hasTotvsAccess(item.totvs_access, churchTotvsId);
    }) as Record<string, unknown> | undefined;
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
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
