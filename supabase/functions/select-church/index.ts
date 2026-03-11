import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT } from "https://esm.sh/jose@5.2.4";

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

function onlyDigits(s: string) {
  return String(s || "").replace(/\D+/g, "");
}

type Body = { cpf?: string; totvs_id?: string };
type ChurchRow = { totvs_id: string; parent_totvs_id: string | null };
type TotvsAccessItem = string | { totvs_id?: string; role?: string };

function normalizeTotvsAccess(arr: unknown, defaultRole: string): { totvs_id: string; role: string }[] {
  const out: { totvs_id: string; role: string }[] = [];
  if (!Array.isArray(arr)) return out;
  const allowed = new Set(["admin", "pastor", "obreiro"]);
  const safeDefault = allowed.has(defaultRole) ? defaultRole : "obreiro";
  for (const item of arr as TotvsAccessItem[]) {
    if (typeof item === "string") {
      const t = item.trim();
      if (t) out.push({ totvs_id: t, role: safeDefault });
      continue;
    }
    if (item && typeof item === "object") {
      const t = String(item.totvs_id || "").trim();
      const r0 = String(item.role || safeDefault).trim().toLowerCase();
      const r = allowed.has(r0) ? r0 : safeDefault;
      if (t) out.push({ totvs_id: t, role: r });
    }
  }
  const uniq = new Map<string, { totvs_id: string; role: string }>();
  for (const x of out) uniq.set(x.totvs_id, x);
  return [...uniq.values()];
}

function computeScope(rootTotvs: string, churches: ChurchRow[]): string[] {
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
    for (const k of children.get(cur) || []) queue.push(k);
  }
  return [...scope];
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

async function signAppToken(payload: { sub: string; app_role: string; active_totvs_id: string }) {
  const secret = Deno.env.get("USER_SESSION_JWT_SECRET") || "";
  if (!secret) return null;
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    role: payload.app_role,
    app_role: payload.app_role,
    active_totvs_id: payload.active_totvs_id,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 60 * 12)
    .sign(new TextEncoder().encode(secret));
}

async function signRlsToken(payload: { sub: string; app_role: string; active_totvs_id: string; scope_totvs_ids: string[]; root_totvs_id: string }) {
  const secret = Deno.env.get("SUPABASE_JWT_SECRET") || "";
  if (!secret) return null;
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    role: "authenticated",
    app_role: payload.app_role,
    active_totvs_id: payload.active_totvs_id,
    scope_totvs_ids: payload.scope_totvs_ids,
    root_totvs_id: payload.root_totvs_id,
    aud: "authenticated",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 60 * 12)
    .sign(new TextEncoder().encode(secret));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const cpf = onlyDigits(body.cpf || "");
    const totvs_id = String(body.totvs_id || "").trim();
    if (cpf.length !== 11) return json({ ok: false, error: "invalid_cpf" }, 400);
    if (!totvs_id) return json({ ok: false, error: "missing_totvs_id" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: user, error: uErr } = await sb
      .from("users")
      .select("id, cpf, full_name, role, is_active, totvs_access")
      .eq("cpf", cpf)
      .maybeSingle();
    if (uErr) return json({ ok: false, error: "db_error_user", details: uErr.message }, 500);
    if (!user) return json({ ok: false, error: "user_not_found" }, 404);
    if (!user.is_active) return json({ ok: false, error: "inactive_user" }, 403);

    const userRole = String(user.role || "obreiro").toLowerCase();
    const access = normalizeTotvsAccess(user.totvs_access, userRole);
    const allowed = access.map((a) => a.totvs_id);
    if (!allowed.includes(totvs_id)) return json({ ok: false, error: "forbidden_totvs" }, 403);

    const { data: activeMeta, error: cErr } = await sb
      .from("churches")
      .select("totvs_id, church_name, class")
      .eq("totvs_id", totvs_id)
      .maybeSingle();
    if (cErr) return json({ ok: false, error: "db_error_church", details: cErr.message }, 500);

    const { data: allChurches, error: aErr } = await sb.from("churches").select("totvs_id,parent_totvs_id");
    if (aErr) return json({ ok: false, error: "db_error_scope", details: aErr.message }, 500);

    const all = (allChurches || []) as ChurchRow[];
    const scope_totvs_ids = computeScope(totvs_id, all);
    const root_totvs_id = computeRootTotvs(totvs_id, all);

    const token = await signAppToken({ sub: String(user.id), app_role: userRole, active_totvs_id: totvs_id });
    if (!token) return json({ ok: false, error: "missing_app_jwt_secret" }, 500);
    const rls_token = await signRlsToken({
      sub: String(user.id),
      app_role: userRole,
      active_totvs_id: totvs_id,
      scope_totvs_ids,
      root_totvs_id,
    });

    return json({
      ok: true,
      mode: "logged_in",
      token,
      rls_token,
      user: { id: user.id, full_name: user.full_name, cpf: user.cpf, role: user.role },
      session: {
        totvs_id,
        church_name: String((activeMeta as Record<string, unknown> | null)?.church_name || ""),
        church_class: String((activeMeta as Record<string, unknown> | null)?.class || ""),
        scope_totvs_ids,
        root_totvs_id,
      },
    }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
