import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

type Role = "admin" | "pastor" | "obreiro";

type SessionClaims = {
  user_id: string;
  role: Role;
  active_totvs_id: string;
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

async function verifySessionJWT(req: Request): Promise<SessionClaims | null> {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  const secret = Deno.env.get("USER_SESSION_JWT_SECRET") || "";
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    const user_id = String(payload.sub || "");
    const role = String(payload.role || "").toLowerCase() as Role;
    const active_totvs_id = String(payload.active_totvs_id || "");

    if (!user_id || !active_totvs_id) return null;
    if (!["admin", "pastor", "obreiro"].includes(role)) return null;

    return { user_id, role, active_totvs_id };
  } catch {
    return null;
  }
}

function resolveStatus(totvsAccess: unknown, activeTotvsId: string, fallbackMinisterRole: string) {
  if (Array.isArray(totvsAccess)) {
    for (const item of totvsAccess) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const entryTotvs = String(entry.totvs_id || "").trim();
      if (entryTotvs && entryTotvs !== activeTotvsId) continue;
      const status = String(entry.registration_status || "").trim().toUpperCase();
      if (status === "PENDENTE" || status === "APROVADO") return status;
    }
  }

  const ministerRole = String(fallbackMinisterRole || "").toUpperCase();
  if (ministerRole.includes("PENDENTE")) return "PENDENTE";
  return "APROVADO";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data: user, error } = await sb
      .from("users")
      .select("id, role, minister_role, totvs_access")
      .eq("id", session.user_id)
      .maybeSingle();

    if (error) return json({ ok: false, error: "db_error_user", details: error.message }, 500);
    if (!user) return json({ ok: false, error: "user_not_found" }, 404);

    // Comentario: pastor/admin sempre aprovados para operacao administrativa.
    const status = session.role === "obreiro"
      ? resolveStatus(user.totvs_access, session.active_totvs_id, String(user.minister_role || ""))
      : "APROVADO";

    return json({
      ok: true,
      registration_status: status,
      is_pending: status === "PENDENTE",
      blocked_resources: status === "PENDENTE"
        ? ["cartas", "documentos"]
        : [],
    }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
