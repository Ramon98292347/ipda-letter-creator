import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

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

type Role = "admin" | "pastor" | "secretario";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };
type Body = {
  id?: string;
  event_id?: string | null;
  event_title?: string | null;
  name?: string;
  description?: string | null;
  image_url?: string | null;
  price?: number;
  is_active?: boolean;
};

async function verifySessionJWT(req: Request): Promise<SessionClaims | null> {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const secret = Deno.env.get("USER_SESSION_JWT_SECRET") || "";
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(m[1].trim(), new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    const user_id = String(payload.sub || "");
    const role = String(payload.role || "").toLowerCase() as Role;
    const active_totvs_id = String(payload.active_totvs_id || "");
    if (!user_id || !active_totvs_id) return null;
    if (!["admin", "pastor", "secretario"].includes(role)) return null;
    return { user_id, role, active_totvs_id };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const session = await verifySessionJWT(req);
  if (!session) return json({ ok: false, error: "unauthorized" }, 401);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const id = body.id ? String(body.id).trim() : "";
    const name = String(body.name || "").trim();
    if (!name && !id) return json({ ok: false, error: "missing_name" }, 400);

    const payload: Record<string, unknown> = {
      church_totvs_id: session.active_totvs_id,
      event_id: body.event_id ?? null,
      event_title: body.event_title ?? null,
      name: name || undefined,
      description: body.description ?? null,
      image_url: body.image_url ?? null,
      price: typeof body.price === "number" ? body.price : undefined,
      is_active: typeof body.is_active === "boolean" ? body.is_active : undefined,
    };

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    if (id) {
      const { data: existing, error: eErr } = await sb
        .from("products")
        .select("id, church_totvs_id")
        .eq("id", id)
        .maybeSingle();
      if (eErr) return json({ ok: false, error: "db_error_find", details: "erro interno" }, 500);
      if (!existing) return json({ ok: false, error: "not_found" }, 404);
      if (String(existing.church_totvs_id || "") !== session.active_totvs_id) {
        return json({ ok: false, error: "forbidden_wrong_church" }, 403);
      }

      const { data, error } = await sb.from("products").update(payload).eq("id", id).select("*").single();
      if (error) return json({ ok: false, error: "db_error_update", details: "erro interno" }, 500);
      return json({ ok: true, product: data });
    }

    const { data, error } = await sb.from("products").insert(payload).select("*").single();
    if (error) return json({ ok: false, error: "db_error_insert", details: "erro interno" }, 500);
    return json({ ok: true, product: data });
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
