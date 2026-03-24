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

function base64UrlToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

async function buildVapidAuthHeader(endpoint: string, vapidPublic: string, vapidPrivate: string, subject: string): Promise<string> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;

  const header = btoa(JSON.stringify({ typ: "JWT", alg: "ES256" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payload = btoa(JSON.stringify({ aud: audience, exp, sub: subject })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsigned = `${header}.${payload}`;

  const privateKeyBytes = base64UrlToUint8Array(vapidPrivate);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned),
  );

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `vapid t=${unsigned}.${signature},k=${vapidPublic}`;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function buildInfo(type: string, context: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  return concat(encoder.encode(`Content-Encoding: ${type}\0`), context);
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", key, ikm));
  const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const infoWithCounter = concat(info, new Uint8Array([1]));
  const result = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, infoWithCounter));
  return result.slice(0, length);
}

async function encryptPayload(payloadStr: string, p256dh: string, auth: string): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const encoder = new TextEncoder();
  const receiverPublicKey = base64UrlToUint8Array(p256dh);
  const receiverAuth = base64UrlToUint8Array(auth);

  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  const serverPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeyPair.publicKey));
  const receiverKey = await crypto.subtle.importKey(
    "raw",
    receiverPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: receiverKey }, serverKeyPair.privateKey, 256),
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const ikm = await hkdf(sharedSecret, receiverAuth, concat(encoder.encode("WebPush: info\0"), receiverPublicKey, serverPublicKeyRaw), 32);
  const cek = await hkdf(ikm, salt, buildInfo("aesgcm128", new Uint8Array(0)), 16);
  const nonce = await hkdf(ikm, salt, buildInfo("nonce", new Uint8Array(0)), 12);

  const cekKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const paddedPayload = concat(new Uint8Array(2), encoder.encode(payloadStr));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cekKey, paddedPayload));

  return { ciphertext, salt, serverPublicKey: serverPublicKeyRaw };
}

async function sendPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublic: string,
  vapidPrivate: string,
  vapidSubject: string,
): Promise<boolean> {
  try {
    const { ciphertext, salt, serverPublicKey } = await encryptPayload(payload, sub.p256dh, sub.auth);
    const vapidAuth = await buildVapidAuthHeader(sub.endpoint, vapidPublic, vapidPrivate, vapidSubject);
    const body = concat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([serverPublicKey.length]), serverPublicKey, ciphertext);

    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        "Authorization": vapidAuth,
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aesgcm",
        "Encryption": `salt=${btoa(String.fromCharCode(...salt)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`,
        "Crypto-Key": `dh=${btoa(String.fromCharCode(...serverPublicKey)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`,
        "TTL": "86400",
      },
      body,
    });

    if (res.status === 410 || res.status === 404) return false;
    return res.ok;
  } catch {
    return false;
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

    if (action === "notify") return await actionNotify(sb, req, body);

    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);

    // Comentario: roteia pelo campo "action" do body
    if (action === "list") return await actionList(sb, session, body);
    if (action === "mark-read") return await actionMarkRead(sb, session, body);
    if (action === "mark-all-read") return await actionMarkAllRead(sb, session);
    if (action === "subscribe-push") return await actionSubscribePush(sb, session, body);

    return json({ ok: false, error: "invalid_action", message: `Ação desconhecida: "${action}". Use: list, mark-read, mark-all-read, subscribe-push, notify` }, 400);
  } catch (err) {
    return json({ ok: false, error: "exception" }, 500);
  }
});
