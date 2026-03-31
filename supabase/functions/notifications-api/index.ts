/**
 * notifications-api
 * =================
 * Consolida as funções anteriores em uma só, roteando pelo campo "action":
 *
 *   action: "list"          → lista notificações (era list-notifications)
 *   action: "mark-read"     → marca uma como lida (era mark-notification-read)
 *   action: "mark-all-read" → limpa todas (era mark-all-notifications-read)
 *   action: "notify"        → envia push web para assinaturas registradas
 *   action: "subscribe-push" → registra assinatura push do usuário
 *
 * Quem pode usar: admin, pastor, obreiro, secretario, financeiro
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";
import { corsHeaders, json } from "../_shared/cors.ts";
import { verifySessionJWT } from "../_shared/jwt.ts";

type ChurchRow = { totvs_id: string; parent_totvs_id: string | null };
type PushSubscriptionKeys = { p256dh: string; auth: string };
type PushSubscriptionJSON = { endpoint: string; keys: PushSubscriptionKeys };

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
  const isFinanceiro = session!.role === "financeiro";

  let qMine = sb.from("notifications").select("*").eq("user_id", session!.user_id).order("created_at", { ascending: false });

  if (isFinanceiro) {
    qMine = qMine.eq("type", "financial");
  }
  if (unreadOnly) {
    qMine = qMine.or("is_read.eq.false,read_at.is.null");
  }

  const { data: myRows, error: myErr } = await qMine;
  if (myErr) return json({ ok: false, error: "db_error_list_user" }, 500);

  const sorted = [...(myRows || [])].sort((a, b) => String((b as Record<string, unknown>).created_at || "").localeCompare(String((a as Record<string, unknown>).created_at || "")));

  const total = sorted.length;
  const notifications = sorted.slice((page - 1) * page_size, page * page_size);
  const unread_count = sorted.filter((n) => !Boolean(n.is_read) || !String(n.read_at || "")).length;

  return json({ ok: true, notifications, total, unread_count, page, page_size });
}

async function actionMarkRead(sb: ReturnType<typeof createClient>, session: Awaited<ReturnType<typeof verifySessionJWT>>, body: Record<string, unknown>) {
  const id = String(body.id || body.notification_id || "").trim();
  const churchTotvsId = String(body.church_totvs_id || "").trim();
  if (!id) {
    let bulkDelete = sb.from("notifications").delete().eq("user_id", session!.user_id);
    if (churchTotvsId) bulkDelete = bulkDelete.eq("church_totvs_id", churchTotvsId);
    const { error: bulkErr } = await bulkDelete;
    if (bulkErr) return json({ ok: false, error: "db_error_bulk_delete" }, 500);
    return json({ ok: true, deleted_scope: churchTotvsId || "all" });
  }

  const { data: row, error: findErr } = await sb
    .from("notifications")
    .select("id, church_totvs_id, user_id, read_at, related_id, type, title, message")
    .eq("id", id)
    .maybeSingle();
  if (findErr) return json({ ok: false, error: "db_error_find" }, 500);
  if (!row) return json({ ok: false, error: "notification_not_found" }, 404);

  const isMine = String(row.user_id || "") === session!.user_id;
  if (!isMine) return json({ ok: false, error: "forbidden" }, 403);

  const idsToUpdate = new Set<string>([id]);
  const relatedId = String(row.related_id || "").trim();
  const type = String(row.type || "").trim();
  const churchId = String(row.church_totvs_id || "").trim();
  const title = String(row.title || "").trim();
  const message = String(row.message || "").trim();

  let siblingsQuery = sb
    .from("notifications")
    .select("id")
    .eq("user_id", session!.user_id)
    .eq("church_totvs_id", churchId)
    .eq("type", type);

  if (relatedId) siblingsQuery = siblingsQuery.eq("related_id", relatedId);
  else siblingsQuery = siblingsQuery.eq("title", title).eq("message", message);

  const { data: siblings, error: siblingsErr } = await siblingsQuery;
  if (siblingsErr) return json({ ok: false, error: "db_error_update_scope" }, 500);
  for (const sibling of siblings || []) idsToUpdate.add(String((sibling as Record<string, unknown>).id || "").trim());

  const idList = [...idsToUpdate].filter(Boolean);
  const { error: updErr } = await sb
    .from("notifications")
    .delete()
    .in("id", idList);
  if (updErr) return json({ ok: false, error: "db_error_update" }, 500);
  return json({ ok: true, deleted_ids: idList });
}

async function actionMarkAllRead(sb: ReturnType<typeof createClient>, session: Awaited<ReturnType<typeof verifySessionJWT>>) {
  const { data: userRows, error: userErr } = await sb.from("notifications").select("id").eq("user_id", session!.user_id);
  if (userErr) return json({ ok: false, error: "db_error_list_user" }, 500);

  const ids = new Set<string>();
  for (const r of userRows || []) ids.add(String((r as Record<string, unknown>).id || ""));
  const idList = [...ids].filter(Boolean);

  if (idList.length === 0) return json({ ok: true, deleted: 0 });

  const { error: delErr } = await sb.from("notifications").delete().in("id", idList);
  if (delErr) return json({ ok: false, error: "db_error_delete" }, 500);
  return json({ ok: true, deleted: idList.length });
}

async function actionSubscribePush(
  sb: ReturnType<typeof createClient>,
  session: Awaited<ReturnType<typeof verifySessionJWT>>,
  body: Record<string, unknown>,
) {
  const sub = body.subscription as PushSubscriptionJSON | undefined;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return json({ ok: false, error: "invalid_subscription" }, 400);
  }

  const { error } = await sb.from("push_subscriptions").upsert(
    {
      user_id: session!.user_id,
      totvs_id: session!.active_totvs_id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) return json({ ok: false, error: "db_error_push_subscription" }, 500);
  return json({ ok: true });
}

async function sendPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublic: string,
  vapidPrivate: string,
  vapidSubject: string,
): Promise<boolean> {
  try {
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    await webpush.sendNotification({
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    }, payload);
    return true;
  } catch (err: unknown) {
    const errorObj = err as Record<string, unknown>;
    // Se o serviço push retornar 404/410 a inscrição não é mais válida
    if (errorObj && (errorObj.statusCode === 404 || errorObj.statusCode === 410)) {
       return false;
    }
    // Erros de timeout ou criptografia ("failed to encrypt") NÃO devem excluir o endpoint!
    // Retornamos true para considerar como enviada e evitar o bloqueio acidental do celular.
    console.error("[web-push] Send error, but preserving subscription:", err);
    return true;
  }
}

async function actionNotify(sb: ReturnType<typeof createClient>, req: Request, body: Record<string, unknown>) {
  const providedKey = String(req.headers.get("x-internal-key") || "").trim();
  const expectedKey = String(Deno.env.get("INTERNAL_KEY") || "").trim();
  if (!expectedKey || providedKey !== expectedKey) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const title = String(body.title || "SGE IPDA").trim();
  const message = String(body.body || "Voce tem uma nova notificacao.").trim();
  const url = String(body.url || "/").trim() || "/";
  const data = typeof body.data === "object" && body.data ? body.data as Record<string, unknown> : {};
  const userIds = Array.isArray(body.user_ids) ? (body.user_ids as unknown[]).map(String).filter(Boolean) : [];
  const totvsIds = Array.isArray(body.totvs_ids) ? (body.totvs_ids as unknown[]).map(String).filter(Boolean) : [];
  if (userIds.length === 0 && totvsIds.length === 0) {
    return json({ ok: false, error: "missing_targets" }, 400);
  }

  const vapidPublic = String(Deno.env.get("VAPID_PUBLIC_KEY") || "").trim();
  const vapidPrivate = String(Deno.env.get("VAPID_PRIVATE_KEY") || "").trim();
  const vapidSubject = String(Deno.env.get("VAPID_SUBJECT") || "mailto:admin@ipda.org.br").trim();
  if (!vapidPublic || !vapidPrivate) {
    return json({ ok: false, error: "vapid_keys_not_configured" }, 500);
  }

  let subscriptionsQuery = sb.from("push_subscriptions").select("endpoint,p256dh,auth,user_id,totvs_id");
  if (userIds.length > 0 && totvsIds.length > 0) {
    subscriptionsQuery = subscriptionsQuery.or(`user_id.in.(${userIds.join(",")}),totvs_id.in.(${totvsIds.join(",")})`);
  } else if (userIds.length > 0) {
    subscriptionsQuery = subscriptionsQuery.in("user_id", userIds);
  } else {
    subscriptionsQuery = subscriptionsQuery.in("totvs_id", totvsIds);
  }

  const { data: subscriptions, error: subErr } = await subscriptionsQuery;
  if (subErr) return json({ ok: false, error: "db_error_push_subscriptions" }, 500);
  if (!subscriptions || subscriptions.length === 0) {
    return json({ ok: true, sent: 0, failed: 0, message: "Nenhuma assinatura encontrada." });
  }

  const uniq = new Map<string, { endpoint: string; p256dh: string; auth: string }>();
  for (const raw of subscriptions) {
    const endpoint = String((raw as Record<string, unknown>).endpoint || "").trim();
    const p256dh = String((raw as Record<string, unknown>).p256dh || "").trim();
    const authKey = String((raw as Record<string, unknown>).auth || "").trim();
    if (!endpoint || !p256dh || !authKey) continue;
    uniq.set(endpoint, { endpoint, p256dh, auth: authKey });
  }

  const payload = JSON.stringify({ title, body: message, url, data });
  let sent = 0;
  let failed = 0;
  const expiredEndpoints: string[] = [];

  await Promise.all(
    [...uniq.values()].map(async (sub) => {
      const ok = await sendPush(sub, payload, vapidPublic, vapidPrivate, vapidSubject);
      if (ok) sent += 1;
      else {
        failed += 1;
        expiredEndpoints.push(sub.endpoint);
      }
    }),
  );

  if (expiredEndpoints.length > 0) {
    await sb.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
  }

  return json({ ok: true, sent, failed });
}

// ─── action birthday — cron diário de aniversariantes ────────────────────────
// Comentario: busca membros que fazem aniversario hoje e envia push para
// os pastores/secretarios da igreja de cada aniversariante.

function todayMonthDaySaoPaulo(): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const mm = parts.find((p) => p.type === "month")?.value || "01";
  const dd = parts.find((p) => p.type === "day")?.value || "01";
  return `${mm}-${dd}`;
}

function monthDay(dateStr: string): string | null {
  const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[2]}-${m[3]}`;
}

async function actionBirthday(sb: ReturnType<typeof createClient>, req: Request) {
  // Comentario: valida segredo do cron ou chave interna
  const cronSecret = String(Deno.env.get("CRON_SECRET") || "").trim();
  const internalKey = String(Deno.env.get("INTERNAL_KEY") || "").trim();
  const providedCron = String(req.headers.get("x-cron-secret") || "").trim();
  const providedInternal = String(req.headers.get("x-internal-key") || "").trim();

  const authorized =
    (cronSecret && providedCron === cronSecret) ||
    (internalKey && providedInternal === internalKey);
  if (!authorized) return json({ ok: false, error: "unauthorized" }, 401);

  // Comentario: busca todos os membros ativos com data de nascimento
  const { data: users, error } = await sb
    .from("users")
    .select("id, full_name, phone, email, birth_date, default_totvs_id")
    .eq("is_active", true)
    .not("birth_date", "is", null);

  if (error) return json({ ok: false, error: "db_error", details: error.message }, 500);

  const todayMD = todayMonthDaySaoPaulo();
  const today = new Date().toISOString().slice(0, 10);

  // Comentario: filtra aniversariantes de hoje e agrupa por igreja
  const byChurch = new Map<string, Array<{ id: string; full_name: string; phone: string | null; email: string | null; birth_date: string | null }>>();

  for (const user of (users || [])) {
    if (monthDay(String(user.birth_date || "")) !== todayMD) continue;
    const church = String(user.default_totvs_id || "");
    if (!church) continue;
    if (!byChurch.has(church)) byChurch.set(church, []);
    byChurch.get(church)!.push(user as { id: string; full_name: string; phone: string | null; email: string | null; birth_date: string | null });
  }

  if (byChurch.size === 0) {
    return json({ ok: true, message: "Nenhum aniversariante hoje.", churches: 0, notifications: 0 });
  }

  let notifications = 0;

  // Comentario: para cada igreja com aniversariante, cria notificação no banco
  // e envia push para os pastores/secretarios dessa igreja
  for (const [churchTotvsId, birthdays] of byChurch) {
    const nomes = birthdays.map((b) => b.full_name).join(", ");
    const title = birthdays.length === 1
      ? `Aniversário: ${birthdays[0].full_name}`
      : `${birthdays.length} aniversariantes hoje`;
    const message = birthdays.length === 1
      ? `${birthdays[0].full_name} faz aniversário hoje! Envie parabéns.`
      : `Aniversariantes: ${nomes}`;

    // Comentario: busca pastores e secretarios da igreja para notificar
    const { data: leaders } = await sb
      .from("users")
      .select("id")
      .eq("default_totvs_id", churchTotvsId)
      .in("role", ["pastor", "secretario"])
      .eq("is_active", true);

    const leaderIds = (leaders || []).map((l) => String((l as Record<string, unknown>).id || "")).filter(Boolean);

    // Comentario: insere notificação na tabela para cada pastor/secretario
    for (const leaderId of leaderIds) {
      await sb.from("notifications").insert({
        church_totvs_id: churchTotvsId,
        user_id: leaderId,
        type: "birthday",
        title,
        message,
        read_at: null,
      });
      notifications++;
    }

    // Comentario: insere notificação de Feliz Aniversário para os PRÓPRIOS aniversariantes
    for (const b of birthdays) {
      await sb.from("notifications").insert({
        church_totvs_id: churchTotvsId,
        user_id: b.id,
        type: "birthday",
        title: "Feliz Aniversário! 🎉",
        message: "O SGE IPDA e a secretaria desejam a você muitas bênçãos pelo seu dia!",
        read_at: null,
      });
      notifications++;
    }

    // Lista abrangente de todos que receberão Push (líderes + aniversariantes)
    const pushRecipients = [...leaderIds, ...birthdays.map(b => b.id)];

    // Comentario: envia push notification para os pastores/secretarios e também aniversariantes
    if (pushRecipients.length > 0) {
      const vapidPublic = String(Deno.env.get("VAPID_PUBLIC_KEY") || "").trim();
      const vapidPrivate = String(Deno.env.get("VAPID_PRIVATE_KEY") || "").trim();
      const vapidSubject = String(Deno.env.get("VAPID_SUBJECT") || "mailto:admin@ipda.org.br").trim();
      if (vapidPublic && vapidPrivate) {
        const { data: subs } = await sb
          .from("push_subscriptions")
          .select("endpoint,p256dh,auth,user_id")
          .in("user_id", pushRecipients);

        for (const raw of (subs || [])) {
          const sub = raw as { endpoint: string; p256dh: string; auth: string; user_id: string };
          if (sub.endpoint && sub.p256dh && sub.auth) {
            // Se for envio pro pastor/secretario, abre aba "membros"
            // Se for envio pro proprio aniversariante, abre aba inicial ou avisos
            const isSelf = birthdays.some(b => b.id === sub.user_id);
            const personalTitle = isSelf ? "Feliz Aniversário! 🎉" : title;
            const personalBody = isSelf ? "O SGE IPDA te deseja muitas bênçãos. Parabéns!" : message;
            const personalUrl = isSelf ? "/" : "/pastor/membros";
            
            const payload = JSON.stringify({ title: personalTitle, body: personalBody, url: personalUrl });
            await sendPush(sub, payload, vapidPublic, vapidPrivate, vapidSubject);
          }
        }
      }
    }
  }

  return json({ ok: true, churches: byChurch.size, notifications, date: today });
}

// ─── handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "").trim();

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    // Comentario: actions que nao precisam de JWT do usuario
    if (action === "notify") return await actionNotify(sb, req, body);
    if (action === "birthday") return await actionBirthday(sb, req);

    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);

    // Comentario: roteia pelo campo "action" do body
    if (action === "list") return await actionList(sb, session, body);
    if (action === "mark-read") return await actionMarkRead(sb, session, body);
    if (action === "mark-all-read") return await actionMarkAllRead(sb, session);
    if (action === "subscribe-push") return await actionSubscribePush(sb, session, body);

    return json({ ok: false, error: "invalid_action", message: `Ação desconhecida: "${action}". Use: list, mark-read, mark-all-read, subscribe-push, notify, birthday` }, 400);
  } catch (err) {
    return json({ ok: false, error: "exception" }, 500);
  }
});
