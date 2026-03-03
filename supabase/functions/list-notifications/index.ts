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

type Role = "admin" | "pastor" | "obreiro";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };
type Body = {
  page?: number;
  page_size?: number;
  unread_only?: boolean;
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;
    const page = Number.isFinite(body.page) ? Math.max(1, Number(body.page)) : 1;
    const page_size = Number.isFinite(body.page_size) ? Math.max(1, Math.min(100, Number(body.page_size))) : 20;
    const unreadOnly = Boolean(body.unread_only);
    const churchTotvs = String(body.church_totvs_id || "").trim() || session.active_totvs_id;

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    let qChurch = sb
      .from("notifications")
      .select("*")
      .eq("church_totvs_id", churchTotvs)
      .order("created_at", { ascending: false });

    let qMine = sb
      .from("notifications")
      .select("*")
      .eq("user_id", session.user_id)
      .order("created_at", { ascending: false });

    if (unreadOnly) {
      qChurch = qChurch.is("read_at", null);
      qMine = qMine.is("read_at", null);
    }

    const [{ data: churchRows, error: churchErr }, { data: myRows, error: myErr }] = await Promise.all([
      qChurch,
      qMine,
    ]);

    if (churchErr) return json({ ok: false, error: "db_error_list_church", details: churchErr.message }, 500);
    if (myErr) return json({ ok: false, error: "db_error_list_user", details: myErr.message }, 500);

    // Comentario: junta notificacoes da igreja + individuais e remove duplicadas por id.
    const merged = [...(churchRows || []), ...(myRows || [])];
    const uniq = new Map<string, Record<string, unknown>>();
    for (const item of merged) uniq.set(String(item.id), item);
    const sorted = [...uniq.values()].sort((a, b) => {
      const da = String(a.created_at || "");
      const db = String(b.created_at || "");
      return db.localeCompare(da);
    });

    const total = sorted.length;
    const from = (page - 1) * page_size;
    const to = from + page_size;
    const notifications = sorted.slice(from, to);
    const unread_count = sorted.filter((n) => !n.read_at).length;

    return json({ ok: true, notifications, total, unread_count, page, page_size }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
