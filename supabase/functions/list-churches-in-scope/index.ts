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
function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders() });
}

type Role = "admin" | "pastor" | "obreiro";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };

async function verifySessionJWT(req: Request): Promise<SessionClaims | null> {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  const token = m[1].trim();
  const secret = Deno.env.get("USER_SESSION_JWT_SECRET") || "";
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
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

type ChurchRow = { totvs_id: string; parent_totvs_id: string | null };

function computeScope(rootTotvs: string, churches: ChurchRow[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const c of churches) {
    const p = c.parent_totvs_id || "";
    if (!children.has(p)) children.set(p, []);
    children.get(p)!.push(String(c.totvs_id));
  }

  const scope = new Set<string>();
  const queue: string[] = [rootTotvs];

  while (queue.length) {
    const cur = queue.shift()!;
    if (scope.has(cur)) continue;
    scope.add(cur);

    const kids = children.get(cur) || [];
    for (const k of kids) queue.push(k);
  }

  return scope;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);
    if (session.role === "obreiro") return json({ ok: false, error: "forbidden" }, 403);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceRoleKey);

    // 1) Carrega todas as igrejas (para montar escopo)
    const { data: all, error: aErr } = await sb
      .from("churches")
      .select("totvs_id, parent_totvs_id");

    if (aErr) return json({ ok: false, error: "db_error_scope", details: aErr.message }, 500);

    const scope = computeScope(session.active_totvs_id, (all || []) as ChurchRow[]);
    const scopeList = [...scope];

    // 2) Busca igrejas do escopo + pastor (join)
    const { data: churches, error: cErr } = await sb
      .from("churches")
      .select(`
        totvs_id,
        parent_totvs_id,
        church_name,
        class,
        is_active,
        image_url,
        stamp_church_url,
        pastor_user_id,
        pastor:pastor_user_id (
          id,
          full_name,
          phone,
          email,
          is_active
        )
      `)
      .in("totvs_id", scopeList)
      .order("church_name", { ascending: true });

    if (cErr) return json({ ok: false, error: "db_error_list_churches", details: cErr.message }, 500);

    // 3) Conta obreiros por igreja (default_totvs_id)
    const { data: workers, error: wErr } = await sb
      .from("users")
      .select("id, default_totvs_id")
      .eq("role", "obreiro")
      .eq("is_active", true)
      .in("default_totvs_id", scopeList);

    if (wErr) return json({ ok: false, error: "db_error_workers_count", details: wErr.message }, 500);

    const counts = new Map<string, number>();
    for (const w of workers || []) {
      const key = String((w as any).default_totvs_id || "");
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const enriched = (churches || []).map((ch: any) => ({
      ...ch,
      workers_count: counts.get(String(ch.totvs_id)) || 0,
    }));

    return json({ ok: true, churches: enriched }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
