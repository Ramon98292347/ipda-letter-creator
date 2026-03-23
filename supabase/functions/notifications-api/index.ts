/**
 * notifications-api
 * =================
 * Consolida as 3 funções anteriores em uma só, roteando pelo campo "action":
 *
 *   action: "list"          → lista notificações (era list-notifications)
 *   action: "mark-read"     → marca uma como lida (era mark-notification-read)
 *   action: "mark-all-read" → limpa todas (era mark-all-notifications-read)
 *
 * Quem pode usar: admin, pastor, obreiro, secretario, financeiro
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { verifySessionJWT } from "../_shared/jwt.ts";

type ChurchRow = { totvs_id: string; parent_totvs_id: string | null };

// ─── helpers de hierarquia ───────────────────────────────────────────────────

function computeScope(rootTotvs: string, churches: ChurchRow[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const c of churches) {
    const p = c.parent_totvs_id || "";
    if (!children.has(p)) children.set(p, []);
    children.get(p)!.push(String(c.totvs_id));
  }
  const scope = new Set<string>();
  const queue = [rootTotvs];
  while (queue.length) {
    const cur = queue.shift()!;
    if (scope.has(cur)) continue;
    scope.add(cur);
    for (const k of children.get(cur) || []) queue.push(k);
  }
  return scope;
}

function collectAncestors(startTotvs: string, churches: ChurchRow[]): Set<string> {
  const byId = new Map<string, string | null>();
  for (const c of churches) byId.set(String(c.totvs_id), c.parent_totvs_id ? String(c.parent_totvs_id) : null);
  const out = new Set<string>();
  let cur = startTotvs;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const parent = byId.get(cur) || null;
    if (!parent) break;
    out.add(parent);
    cur = parent;
  }
  return out;
}

// ─── actions ─────────────────────────────────────────────────────────────────

async function actionList(sb: ReturnType<typeof createClient>, session: Awaited<ReturnType<typeof verifySessionJWT>>, body: Record<string, unknown>) {
  const page = Number.isFinite(body.page) ? Math.max(1, Number(body.page)) : 1;
  const page_size = Number.isFinite(body.page_size) ? Math.max(1, Math.min(100, Number(body.page_size))) : 20;
  const unreadOnly = Boolean(body.unread_only);
  const churchTotvs = String(body.church_totvs_id || "").trim() || session!.active_totvs_id;
  const isFinanceiro = session!.role === "financeiro";

  let qChurch = sb.from("notifications").select("*").eq("church_totvs_id", churchTotvs).order("created_at", { ascending: false });
  let qMine = sb.from("notifications").select("*").eq("user_id", session!.user_id).order("created_at", { ascending: false });

  if (isFinanceiro) {
    qChurch = qChurch.eq("type", "financial");
    qMine = qMine.eq("type", "financial");
  }
  if (unreadOnly) {
    qChurch = qChurch.or("is_read.eq.false,read_at.is.null");
    qMine = qMine.or("is_read.eq.false,read_at.is.null");
  }

  const [{ data: churchRows, error: churchErr }, { data: myRows, error: myErr }] = await Promise.all([qChurch, qMine]);
  if (churchErr) return json({ ok: false, error: "db_error_list_church" }, 500);
  if (myErr) return json({ ok: false, error: "db_error_list_user" }, 500);

  const merged = [...(churchRows || []), ...(myRows || [])];
  const uniq = new Map<string, Record<string, unknown>>();
  for (const item of merged) uniq.set(String(item.id), item);
  const sorted = [...uniq.values()].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

  const total = sorted.length;
  const notifications = sorted.slice((page - 1) * page_size, page * page_size);
  const unread_count = sorted.filter((n) => !Boolean(n.is_read) || !String(n.read_at || "")).length;

  return json({ ok: true, notifications, total, unread_count, page, page_size });
}

async function actionMarkRead(sb: ReturnType<typeof createClient>, session: Awaited<ReturnType<typeof verifySessionJWT>>, body: Record<string, unknown>) {
  const id = String(body.id || "").trim();
  if (!id) return json({ ok: false, error: "missing_id" }, 400);

  const { data: row, error: findErr } = await sb.from("notifications").select("id, church_totvs_id, user_id, read_at").eq("id", id).maybeSingle();
  if (findErr) return json({ ok: false, error: "db_error_find" }, 500);
  if (!row) return json({ ok: false, error: "notification_not_found" }, 404);

  const isMine = String(row.user_id || "") === session!.user_id;
  let isChurchAllowed = String(row.church_totvs_id || "") === session!.active_totvs_id;

  if (!isChurchAllowed && (session!.role === "pastor" || session!.role === "admin")) {
    const { data: allChurches, error: cErr } = await sb.from("churches").select("totvs_id,parent_totvs_id");
    if (cErr) return json({ ok: false, error: "db_error_scope" }, 500);
    const rows = (allChurches || []) as ChurchRow[];
    const scope = computeScope(session!.active_totvs_id, rows);
    const ancestors = collectAncestors(session!.active_totvs_id, rows);
    isChurchAllowed = scope.has(String(row.church_totvs_id || "")) || ancestors.has(String(row.church_totvs_id || ""));
  }

  if (!isMine && !isChurchAllowed) return json({ ok: false, error: "forbidden" }, 403);

  const { data: updated, error: updErr } = await sb.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id).select("*").single();
  if (updErr) return json({ ok: false, error: "db_error_update" }, 500);
  return json({ ok: true, notification: updated });
}

async function actionMarkAllRead(sb: ReturnType<typeof createClient>, session: Awaited<ReturnType<typeof verifySessionJWT>>) {
  const [{ data: churchRows, error: churchErr }, { data: userRows, error: userErr }] = await Promise.all([
    sb.from("notifications").select("id").eq("church_totvs_id", session!.active_totvs_id),
    sb.from("notifications").select("id").eq("user_id", session!.user_id),
  ]);

  if (churchErr) return json({ ok: false, error: "db_error_list_church" }, 500);
  if (userErr) return json({ ok: false, error: "db_error_list_user" }, 500);

  const ids = new Set<string>();
  for (const r of [...(churchRows || []), ...(userRows || [])]) ids.add(String((r as Record<string, unknown>).id || ""));
  const idList = [...ids].filter(Boolean);

  if (idList.length === 0) return json({ ok: true, deleted: 0 });

  const { error: delErr } = await sb.from("notifications").delete().in("id", idList);
  if (delErr) return json({ ok: false, error: "db_error_delete" }, 500);
  return json({ ok: true, deleted: idList.length });
}

// ─── handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "").trim();

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    // Comentario: roteia pelo campo "action" do body
    if (action === "list") return await actionList(sb, session, body);
    if (action === "mark-read") return await actionMarkRead(sb, session, body);
    if (action === "mark-all-read") return await actionMarkAllRead(sb, session);

    return json({ ok: false, error: "invalid_action", message: `Ação desconhecida: "${action}". Use: list, mark-read, mark-all-read` }, 400);
  } catch (err) {
    return json({ ok: false, error: "exception" }, 500);
  }
});
