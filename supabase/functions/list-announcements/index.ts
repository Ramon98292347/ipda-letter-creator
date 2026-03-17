// supabase/functions/list-announcements/index.ts
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
type Body = { limit?: number };
type ChurchRow = { totvs_id: string; parent_totvs_id: string | null };

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
    if (!user_id || !active_totvs_id || !["admin", "pastor", "obreiro"].includes(role)) return null;
    return { user_id, role, active_totvs_id };
  } catch { return null; }
}

function computeRootTotvs(activeTotvs: string, churches: ChurchRow[]): string {
  const parentById = new Map<string, string | null>();
  for (const c of churches) parentById.set(String(c.totvs_id), c.parent_totvs_id ? String(c.parent_totvs_id) : null);
  let cur = activeTotvs;
  const guard = new Set<string>();
  while (true) {
    if (guard.has(cur)) return activeTotvs;
    guard.add(cur);
    const parent = parentById.get(cur) ?? null;
    if (!parent) return cur;
    cur = parent;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;
    const limit = Math.max(1, Math.min(10, Number(body.limit || 10)));

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: allChurches, error: aErr } = await sb.from("churches").select("totvs_id, parent_totvs_id");
    if (aErr) return json({ ok: false, error: "db_error_churches", details: aErr.message }, 500);

    const activeTotvs = session.active_totvs_id;
    const rootTotvs = computeRootTotvs(activeTotvs, (allChurches || []) as ChurchRow[]);
    const totvsList = rootTotvs === activeTotvs ? [activeTotvs] : [activeTotvs, rootTotvs];

    const { data, error } = await sb
      .from("announcements")
      .select("id, church_totvs_id, title, type, body_text, media_url, link_url, position, starts_at, ends_at, is_active, created_at")
      .in("church_totvs_id", totvsList)
      .eq("is_active", true);

    if (error) return json({ ok: false, error: "db_error_list_announcements", details: error.message }, 500);

    const now = Date.now();
    const inWindow = (data || []).filter((a: Record<string, unknown>) => {
      const startsOk = !a.starts_at || new Date(String(a.starts_at)).getTime() <= now;
      const endsOk = !a.ends_at || new Date(String(a.ends_at)).getTime() >= now;
      return startsOk && endsOk;
    });

    const sorted = inWindow.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const aPri = a.church_totvs_id === activeTotvs ? 0 : 1;
      const bPri = b.church_totvs_id === activeTotvs ? 0 : 1;
      if (aPri !== bPri) return aPri - bPri;
      const posA = Number(a.position ?? 999), posB = Number(b.position ?? 999);
      if (posA !== posB) return posA - posB;
      return new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime();
    });

    return json({ ok: true, active_totvs_id: activeTotvs, root_totvs_id: rootTotvs, announcements: sorted.slice(0, limit) });
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
