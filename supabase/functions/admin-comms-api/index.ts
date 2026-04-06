import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

type SessionClaims = {
  user_id: string;
  role: string;
  active_totvs_id: string;
};

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
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
    const rawRole = String(payload.role || "").toLowerCase();
    const appRole = String(payload.app_role || "").toLowerCase();
    const resolvedRole = rawRole === "authenticated" ? appRole : rawRole;
    const active_totvs_id = String(payload.active_totvs_id || "");
    if (!user_id || !active_totvs_id) return null;
    return { user_id, role: resolvedRole, active_totvs_id };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const session = await verifySessionJWT(req);
  if (!session) return json({ ok: false, error: "unauthorized" }, 401);
  if (session.role !== "admin") return json({ ok: false, error: "forbidden" }, 403);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "").trim().toLowerCase();
  if (action !== "notify") return json({ ok: false, error: "invalid_action", message: 'Use action: "notify"' }, 400);

  const title = String(body.title || "").trim();
  const message = String(body.body || "").trim();
  const url = String(body.url || "/").trim() || "/";
  const user_ids = Array.isArray(body.user_ids) ? (body.user_ids as unknown[]).map((v) => String(v || "").trim()).filter(Boolean) : [];
  const totvs_ids = Array.isArray(body.totvs_ids) ? (body.totvs_ids as unknown[]).map((v) => String(v || "").trim()).filter(Boolean) : [];

  if (!title || !message) return json({ ok: false, error: "title_and_body_required" }, 400);
  if (user_ids.length === 0 && totvs_ids.length === 0) {
    return json({ ok: false, error: "missing_targets", detail: "Informe usuarios ou igrejas destino." }, 400);
  }

  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const internalKey = String(Deno.env.get("INTERNAL_KEY") || "").trim();
  if (!supabaseUrl || !internalKey) {
    return json({ ok: false, error: "missing_server_config", detail: "SUPABASE_URL/INTERNAL_KEY ausentes." }, 500);
  }

  const payload: Record<string, unknown> = {
    action: "notify",
    title,
    body: message,
    url,
    user_ids,
    totvs_ids,
    data: typeof body.data === "object" && body.data ? body.data : { source: "admin-comms" },
  };

  const resp = await fetch(`${supabaseUrl}/functions/v1/notifications-api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": internalKey,
    },
    body: JSON.stringify(payload),
  });

  const rawText = await resp.text();
  let rawJson: unknown = {};
  try {
    rawJson = JSON.parse(rawText);
  } catch {
    rawJson = { raw: rawText };
  }
  return json(rawJson, resp.status);
});
