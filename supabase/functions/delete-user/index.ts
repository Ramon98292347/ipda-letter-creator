/**
 * delete-user
 * ===========
 * O que faz: Exclui permanentemente um usuário e todos os seus dados relacionados
 *            (cartas, documentos de ficha/carteirinha, notificações, solicitações de liberação).
 * Para que serve: Usada pelo admin ou pastor para remover um cadastro de obreiro do sistema.
 * Quem pode usar: admin, pastor (somente obreiros dentro do próprio escopo)
 * Recebe: { user_id: string }
 * Retorna: { ok: true }
 * Observações: Não é possível deletar a si mesmo. Pastor não pode deletar admins.
 *              A exclusão é em cascata: remove dados de release_requests, member_carteirinha_documents,
 *              member_ficha_documents, member_ficha_obreiro_documents, notifications e letters.
 */
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

// Comentario: tipos para church e hierarchy rank
type ChurchRow = { totvs_id: string; parent_totvs_id: string | null; class: string };
type ChurchClass = "estadual" | "setorial" | "central" | "regional" | "local";

type Role = "admin" | "pastor" | "obreiro" | "secretario" | "financeiro";
type SessionClaims = {
  user_id: string;
  role: Role;
  active_totvs_id: string;
  scope_totvs_ids?: string[];
};

// Comentario: computa escopo de igrejas (raiz + todas as filhas na hierarquia)
function computeScope(rootTotvs: string, churches: ChurchRow[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const c of churches) {
    const p = c.parent_totvs_id || "";
    if (!children.has(p)) children.set(p, []);
    children.get(p)!.push(c.totvs_id);
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

// Comentario: retorna o rank da class da church para comparacao hierarquica
function getRankForClass(churchClass: string | null): number {
  const classStr = String(churchClass || "").toLowerCase();
  const rank: Record<string, number> = {
    estadual: 5,
    setorial: 4,
    central: 3,
    regional: 2,
    local: 1,
  };
  return rank[classStr] || 0;
}

async function verifySessionJWT(req: Request): Promise<SessionClaims | null> {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  const token = m[1].trim();
  const secret = Deno.env.get("USER_SESSION_JWT_SECRET") || "";
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    const user_id = String(payload.sub || "");
    const role = String(payload.role || "").toLowerCase() as Role;
    const active_totvs_id = String(payload.active_totvs_id || "");
    const scope_totvs_ids = Array.isArray(payload.scope_totvs_ids)
      ? payload.scope_totvs_ids.map((x) => String(x || "")).filter(Boolean)
      : [];
    if (!user_id || !active_totvs_id) return null;
    if (!["admin", "pastor", "obreiro", "secretario", "financeiro"].includes(role)) return null;
    return { user_id, role, active_totvs_id, scope_totvs_ids };
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

    const body = (await req.json().catch(() => ({}))) as { user_id?: string };
    const targetId = String(body.user_id || "").trim();
    if (!targetId) return json({ ok: false, error: "missing_user_id" }, 400);
    if (targetId === session.user_id) return json({ ok: false, error: "cannot_delete_self" }, 409);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data: target, error: targetErr } = await sb
      .from("users")
      .select("id, role, default_totvs_id")
      .eq("id", targetId)
      .maybeSingle();

    if (targetErr) return json({ ok: false, error: "db_error_target", details: targetErr.message }, 500);
    if (!target) return json({ ok: false, error: "user_not_found" }, 404);

    // Comentario: validacoes adicionais para role pastor (com hierarquia)
    if (session.role === "pastor") {
      const targetRole = String(target.role || "").toLowerCase();

      // Comentario: pastor nunca pode deletar admin
      if (targetRole === "admin") return json({ ok: false, error: "forbidden_target_admin" }, 403);

      // Comentario: valida escopo
      const targetTotvs = String(target.default_totvs_id || "");
      const allowed = new Set([session.active_totvs_id, ...(session.scope_totvs_ids || [])]);
      if (!targetTotvs || !allowed.has(targetTotvs)) {
        return json({ ok: false, error: "forbidden_out_of_scope" }, 403);
      }

      // Comentario: se o target for outro pastor, verifica rank hierarquico
      if (targetRole === "pastor") {
        const { data: churches } = await sb.from("churches").select("totvs_id, parent_totvs_id, class");
        const churchRows = (churches || []) as ChurchRow[];

        const sessionChurch = churchRows.find((c) => c.totvs_id === session.active_totvs_id);
        const targetChurch = churchRows.find((c) => c.totvs_id === targetTotvs);

        const sessionRank = getRankForClass(sessionChurch?.class || null);
        const targetRank = getRankForClass(targetChurch?.class || null);

        // Comentario: session pastor precisa de rank >= alvo pastor
        if (sessionRank < targetRank) {
          return json({ ok: false, error: "forbidden_higher_rank" }, 403);
        }
      }
    }

    // Comentario: tabelas que referenciam o usuario e precisam ser limpas
    const cleanupTables = [
      "release_requests",
      "member_carteirinha_documents",
      "member_ficha_documents",
      "member_ficha_obreiro_documents",
      "ministerial_meeting_attendance",
    ];
    for (const table of cleanupTables) {
      await sb.from(table).delete().eq("member_id", targetId);
      await sb.from(table).delete().eq("requester_user_id", targetId);
      await sb.from(table).delete().eq("requested_by_user_id", targetId);
    }
    await sb.from("notifications").delete().eq("user_id", targetId);
    await sb.from("letters").delete().eq("preacher_user_id", targetId);

    const { error: userDeleteErr } = await sb.from("users").delete().eq("id", targetId);
    if (userDeleteErr) return json({ ok: false, error: "db_error_delete_user", details: userDeleteErr.message }, 500);

    return json({ ok: true }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});

