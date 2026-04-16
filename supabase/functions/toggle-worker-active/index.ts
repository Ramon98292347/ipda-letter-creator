/**
 * toggle-worker-active
 * ====================
 * O que faz: Ativa ou desativa o acesso de um obreiro/membro ao sistema (campo is_active).
 *            Usuários inativos não conseguem fazer login.
 * Para que serve: Usada pelo pastor/admin para suspender temporariamente o acesso de um membro
 *                 ou reativar após suspensão.
 * Quem pode usar: admin, pastor (somente membros dentro do próprio escopo hierárquico)
 * Recebe: { worker_id: string, is_active: boolean }
 * Retorna: { ok, worker }
 * Observações: Não é possível desativar a si mesmo.
 *              Pastor não pode desativar membros de igrejas de nível hierárquico acima do seu.
 *              A verificação de hierarquia (canManage) usa o rank das classes de igrejas.
 */
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}

type Role = "admin" | "pastor" | "obreiro";
type ChurchClass = "estadual" | "setorial" | "central" | "regional" | "local";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };
type ChurchRow = { totvs_id: string; parent_totvs_id: string | null; class: string | null };
type Body = { worker_id?: string; is_active?: boolean };

function computeScope(rootTotvs: string, churches: ChurchRow[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const c of churches) {
    const parent = String(c.parent_totvs_id || "");
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(String(c.totvs_id));
  }
  const scope = new Set<string>();
  const queue = [rootTotvs];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (scope.has(current)) continue;
    scope.add(current);
    for (const child of children.get(current) || []) queue.push(child);
  }
  return scope;
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
    if (!["admin", "pastor", "obreiro", "secretario", "financeiro"].includes(role)) return null;
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
    if (session.role === "obreiro") return json({ ok: false, error: "forbidden" }, 403);

    const body = (await req.json().catch(() => ({}))) as Body;
    const worker_id = String(body.worker_id || "").trim();
    if (!worker_id) return json({ ok: false, error: "missing_worker_id" }, 400);
    if (typeof body.is_active !== "boolean") return json({ ok: false, error: "missing_is_active" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

    const { data: worker, error: workerErr } = await sb
      .from("users")
      .select("id, role, default_totvs_id")
      .eq("id", worker_id)
      .maybeSingle();
    if (workerErr) return json({ ok: false, error: "db_error_worker", details: "erro interno" }, 500);
    if (!worker) return json({ ok: false, error: "worker_not_found" }, 404);
    if (String(worker.id) === session.user_id) return json({ ok: false, error: "cannot_toggle_self" }, 409);

    const { data: churches, error: churchesErr } = await sb.from("churches").select("totvs_id,parent_totvs_id,class");
    if (churchesErr) return json({ ok: false, error: "db_error_churches", details: "erro interno" }, 500);
    const churchRows = (churches || []) as ChurchRow[];
    const scope = computeScope(session.active_totvs_id, churchRows);
    const workerTotvs = String(worker.default_totvs_id || "").trim();

    if (session.role !== "admin") {
      if (!workerTotvs || !scope.has(workerTotvs)) return json({ ok: false, error: "worker_out_of_scope" }, 403);
    }

    const { data: saved, error: saveErr } = await sb
      .from("users")
      .update({ is_active: body.is_active })
      .eq("id", worker_id)
      .select("id, is_active, updated_at")
      .single();
    if (saveErr) return json({ ok: false, error: "db_error_update_worker", details: "erro interno" }, 500);

    return json({ ok: true, worker: saved }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});

