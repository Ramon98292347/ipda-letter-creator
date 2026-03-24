/**
 * set-worker-direct-release
 * =========================
 * O que faz: Ativa ou desativa a flag can_create_released_letter de um obreiro.
 *            Quando true, as cartas criadas por esse obreiro nascem com status LIBERADA
 *            automaticamente (sem precisar de aprovação manual do pastor).
 * Para que serve: Usada pelo pastor/admin para configurar obreiros de confiança que podem
 *                 criar cartas liberadas diretamente, sem passar pelo fluxo de aprovação.
 * Quem pode usar: admin, pastor (somente obreiros dentro do próprio escopo)
 * Recebe: { worker_id: string, can_create_released_letter: boolean }
 * Retorna: { ok, worker }
 * Observações: Só funciona para usuários com role="obreiro".
 *              O usuário logado não pode alterar a própria flag.
 *              Pastor não pode conceder liberação a obreiros de igrejas de nível acima do seu.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";
import { insertNotification, sendInternalPushNotification } from "../_shared/push.ts";

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
type ChurchClass = "estadual" | "setorial" | "central" | "regional" | "local";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };
type ChurchRow = { totvs_id: string; parent_totvs_id: string | null; class: string | null };
type Body = { worker_id?: string; can_create_released_letter?: boolean };

function normalizeChurchClass(value: string | null | undefined): ChurchClass | null {
  const safe = String(value || "").trim().toLowerCase();
  if (safe === "estadual" || safe === "setorial" || safe === "central" || safe === "regional" || safe === "local") return safe;
  return null;
}

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

function canManage(sessionRole: Role, sessionClass: ChurchClass | null, targetClass: ChurchClass | null): boolean {
  if (sessionRole === "admin") return true;
  if (!sessionClass || !targetClass) return false;
  const rank: Record<ChurchClass, number> = { estadual: 5, setorial: 4, central: 3, regional: 2, local: 1 };
  return rank[targetClass] <= rank[sessionClass];
}

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
    if (typeof body.can_create_released_letter !== "boolean") {
      return json({ ok: false, error: "missing_can_create_released_letter" }, 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data: target, error: targetErr } = await sb
      .from("users")
      .select("id, role, default_totvs_id, full_name")
      .eq("id", worker_id)
      .maybeSingle();

    if (targetErr) return json({ ok: false, error: "db_error_target", details: targetErr.message }, 500);
    if (!target) return json({ ok: false, error: "worker_not_found" }, 404);
    if (String(target.id) === session.user_id) {
      return json({ ok: false, error: "cannot_release_self_direct" }, 403);
    }
    if (String(target.role || "").toLowerCase() !== "obreiro") {
      return json({ ok: false, error: "target_is_not_obreiro" }, 403);
    }

    if (session.role !== "admin") {
      const { data: churches, error: churchesErr } = await sb.from("churches").select("totvs_id,parent_totvs_id,class");
      if (churchesErr) return json({ ok: false, error: "db_error_churches", details: churchesErr.message }, 500);

      const churchRows = (churches || []) as ChurchRow[];
      const scope = computeScope(session.active_totvs_id, churchRows);
      const map = new Map(churchRows.map((c) => [String(c.totvs_id), c]));
      const sessionClass = normalizeChurchClass(map.get(session.active_totvs_id)?.class);
      const targetTotvs = String(target.default_totvs_id || "").trim();
      const targetClass = normalizeChurchClass(map.get(targetTotvs)?.class);

      if (!targetTotvs || !scope.has(targetTotvs)) {
        return json({ ok: false, error: "worker_out_of_scope" }, 403);
      }
      if (!canManage(session.role, sessionClass, targetClass)) {
        return json({ ok: false, error: "forbidden_hierarchy" }, 403);
      }
    }

    const { data: updated, error: updateErr } = await sb
      .from("users")
      .update({ can_create_released_letter: body.can_create_released_letter })
      .eq("id", worker_id)
      .select("id, can_create_released_letter, updated_at")
      .single();

    if (updateErr) return json({ ok: false, error: "db_error_update", details: updateErr.message }, 500);

    const notificationTitle = body.can_create_released_letter ? "Liberacao direta ativada" : "Liberacao direta removida";
    const notificationMessage = body.can_create_released_letter
      ? "Suas cartas agora podem nascer liberadas automaticamente."
      : "Suas cartas voltaram a depender de liberacao manual.";
    try {
      await insertNotification({
        church_totvs_id: String(target.default_totvs_id || session.active_totvs_id || ""),
        user_id: String(target.id || ""),
        type: "direct_release_changed",
        title: notificationTitle,
        message: notificationMessage,
      });
      await sendInternalPushNotification({
        title: notificationTitle,
        body: notificationMessage,
        url: "/usuario",
        user_ids: [String(target.id || "")],
        totvs_ids: [String(target.default_totvs_id || session.active_totvs_id || "")],
        data: { user_id: String(target.id || ""), can_create_released_letter: body.can_create_released_letter },
      });
    } catch {
      // Comentario: falha de notificacao nao impede salvar a configuracao.
    }

    return json({ ok: true, worker: updated }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
