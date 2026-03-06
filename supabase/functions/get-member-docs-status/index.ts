import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  };
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders() });
}

type Role = "admin" | "pastor" | "obreiro";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };
type Body = {
  member_id?: string;
  church_totvs_id?: string;
};

async function verifySessionJWT(req: Request): Promise<SessionClaims | null> {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  const secret = Deno.env.get("USER_SESSION_JWT_SECRET") || "";
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;
    const memberId = String(body.member_id || session.user_id || "").trim();
    const churchTotvsId = String(body.church_totvs_id || session.active_totvs_id || "").trim();

    if (!memberId) return json({ ok: false, error: "missing_member_id" }, 400);
    if (!churchTotvsId) return json({ ok: false, error: "missing_church_totvs_id" }, 400);

    if (session.role === "obreiro" && memberId !== session.user_id) {
      return json({ ok: false, error: "forbidden_only_own_member" }, 403);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const [{ data: ficha, error: fichaErr }, { data: carteirinha, error: cardErr }] = await Promise.all([
      sb
        .from("member_ficha_documents")
        .select("id, member_id, church_totvs_id, status, final_url, error_message, requested_at, finished_at, updated_at")
        .eq("member_id", memberId)
        .eq("church_totvs_id", churchTotvsId)
        .maybeSingle(),
      sb
        .from("member_carteirinha_documents")
        .select("id, member_id, church_totvs_id, status, final_url, ficha_url_qr, error_message, requested_at, finished_at, updated_at")
        .eq("member_id", memberId)
        .eq("church_totvs_id", churchTotvsId)
        .maybeSingle(),
    ]);

    if (fichaErr) return json({ ok: false, error: "db_error_ficha", details: fichaErr.message }, 500);
    if (cardErr) return json({ ok: false, error: "db_error_carteirinha", details: cardErr.message }, 500);

    const fichaReady = String(ficha?.final_url || "").trim().length > 0;
    const cardReady = String(carteirinha?.final_url || "").trim().length > 0;

    return json(
      {
        ok: true,
        member_id: memberId,
        church_totvs_id: churchTotvsId,
        ficha: ficha || null,
        carteirinha: carteirinha || null,
        rules: {
          ficha_pronta: fichaReady,
          carteirinha_pronta: cardReady,
          can_generate_carteirinha: fichaReady,
        },
      },
      200,
    );
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
