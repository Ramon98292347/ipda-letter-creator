/**
 * announcements-api
 * =================
 * O que faz: Centraliza as operacoes de divulgacoes/comunicados em uma unica edge function.
 * Para que serve: Simplifica a manutencao do modulo de conteudo sem quebrar o contrato do sistema.
 * Quem pode usar:
 *   - action="list": admin, pastor, obreiro com JWT; ou publico com cpf no body e sem JWT
 *   - action="list-public": publico
 *   - action="list-admin": admin, pastor
 *   - action="upsert": admin, pastor
 *   - action="delete": admin, pastor
 *   - action="list-events": admin, pastor
 *   - action="upsert-event": admin, pastor
 *   - action="delete-event": admin, pastor
 *   - action="list-events-public": publico
 *   - action="list-banners": admin, pastor
 *   - action="upsert-banner": admin, pastor
 *   - action="delete-banner": admin, pastor
 *   - action="list-banners-public": publico
 * Recebe:
 *   - list: { action: "list", limit?: number, cpf?: string }
 *   - list-public: payload da function legada list-announcements-public
 *   - list-admin: payload da function legada list-announcements-admin
 *   - upsert: { action: "upsert", id?: string, title, type, body_text?, media_url?, link_url?, position?, starts_at?, ends_at?, is_active? }
 *   - delete: { action: "delete", id: string }
 *   - list-events/upsert-event/delete-event/list-events-public: payload da function legada correspondente
 *   - list-banners/upsert-banner/delete-banner/list-banners-public: payload da function legada correspondente
 * Retorna: o mesmo payload de cada operacao correspondente.
 * Observacoes:
 *   - verify_jwt deve permanecer desligado no config.toml.
 *   - A propria function valida o JWT customizado quando necessario.
 *   - Events e banners sao encaminhados para as functions legadas do projeto remoto.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

type Role = "admin" | "pastor" | "obreiro";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };
type ChurchRow = { totvs_id: string; parent_totvs_id: string | null };
type AnnouncementType = "text" | "image" | "video";
type Action =
  | "list"
  | "list-public"
  | "list-admin"
  | "upsert"
  | "delete"
  | "list-events"
  | "upsert-event"
  | "delete-event"
  | "list-events-public"
  | "list-banners"
  | "upsert-banner"
  | "delete-banner"
  | "list-banners-public";
type Body = {
  action?: Action;
  limit?: number;
  cpf?: string;
  id?: string;
  title?: string;
  type?: AnnouncementType;
  body_text?: string | null;
  media_url?: string | null;
  link_url?: string | null;
  position?: number;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active?: boolean;
};

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

const FORWARDED_ACTIONS: Record<string, string> = {
  "list-public": "list-announcements-public",
  "list-admin": "list-announcements-admin",
  "list-events": "list-events",
  "upsert-event": "upsert-event",
  "delete-event": "delete-event",
  "list-events-public": "list-events-public",
  "list-banners": "list-banners",
  "upsert-banner": "upsert-banner",
  "delete-banner": "delete-banner",
  "list-banners-public": "list-banners-public",
};

function buildForwardHeaders(req: Request) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const auth = req.headers.get("authorization");
  const apikey = req.headers.get("apikey");
  const clientInfo = req.headers.get("x-client-info");
  if (auth) headers.authorization = auth;
  if (apikey) headers.apikey = apikey;
  if (clientInfo) headers["x-client-info"] = clientInfo;
  return headers;
}

async function forwardToLegacy(req: Request, body: Body, slug: string) {
  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  if (!supabaseUrl) return json({ ok: false, error: "missing_supabase_url" }, 500);

  const forwardBody = { ...body };
  delete (forwardBody as Record<string, unknown>).action;

  const resp = await fetch(`${supabaseUrl}/functions/v1/${slug}`, {
    method: "POST",
    headers: buildForwardHeaders(req),
    body: JSON.stringify(forwardBody),
  });

  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: corsHeaders(),
  });
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

function computeRootTotvs(activeTotvs: string, churches: ChurchRow[]): string {
  const parentById = new Map<string, string | null>();
  for (const church of churches) parentById.set(String(church.totvs_id), church.parent_totvs_id ? String(church.parent_totvs_id) : null);

  let current = activeTotvs;
  const guard = new Set<string>();
  while (true) {
    if (guard.has(current)) return activeTotvs;
    guard.add(current);
    const parent = parentById.get(current) ?? null;
    if (!parent) return current;
    current = parent;
  }
}

function isValidISODate(value: string) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

async function actionList(sb: ReturnType<typeof createClient>, req: Request, body: Body) {
  const limit = Math.max(1, Math.min(10, Number(body.limit || 10)));
  const session = await verifySessionJWT(req);

  let activeTotvs = "";
  if (session) {
    activeTotvs = session.active_totvs_id;
  } else {
    const cpfRaw = String(body.cpf || "").replace(/\D/g, "");
    if (cpfRaw.length !== 11) return json({ ok: false, error: "unauthorized" }, 401);

    const { data: userRow, error: userErr } = await sb
      .from("users")
      .select("default_totvs_id")
      .eq("cpf", cpfRaw)
      .maybeSingle();

    if (userErr || !userRow?.default_totvs_id) {
      return json({ ok: true, active_totvs_id: "", root_totvs_id: "", announcements: [] });
    }

    activeTotvs = String(userRow.default_totvs_id);
  }

  const { data: allChurches, error: churchesErr } = await sb.from("churches").select("totvs_id, parent_totvs_id");
  if (churchesErr) return json({ ok: false, error: "db_error_churches", details: churchesErr.message }, 500);

  const rootTotvs = computeRootTotvs(activeTotvs, (allChurches || []) as ChurchRow[]);
  const totvsList = rootTotvs === activeTotvs ? [activeTotvs] : [activeTotvs, rootTotvs];

  const { data, error } = await sb
    .from("announcements")
    .select("id, church_totvs_id, title, type, body_text, media_url, link_url, position, starts_at, ends_at, is_active, created_at")
    .in("church_totvs_id", totvsList)
    .eq("is_active", true);

  if (error) return json({ ok: false, error: "db_error_list_announcements", details: error.message }, 500);

  const now = Date.now();
  const inWindow = (data || []).filter((item: Record<string, unknown>) => {
    const startsOk = !item.starts_at || new Date(String(item.starts_at)).getTime() <= now;
    const endsOk = !item.ends_at || new Date(String(item.ends_at)).getTime() >= now;
    return startsOk && endsOk;
  });

  const sorted = inWindow.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
    const aPri = a.church_totvs_id === activeTotvs ? 0 : 1;
    const bPri = b.church_totvs_id === activeTotvs ? 0 : 1;
    if (aPri !== bPri) return aPri - bPri;
    const posA = Number(a.position ?? 999);
    const posB = Number(b.position ?? 999);
    if (posA !== posB) return posA - posB;
    return new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime();
  });

  return json({ ok: true, active_totvs_id: activeTotvs, root_totvs_id: rootTotvs, announcements: sorted.slice(0, limit) });
}

async function actionUpsert(sb: ReturnType<typeof createClient>, req: Request, body: Body) {
  const session = await verifySessionJWT(req);
  if (!session) return json({ ok: false, error: "unauthorized" }, 401);
  if (session.role === "obreiro") return json({ ok: false, error: "forbidden" }, 403);

  const id = String(body.id || "").trim();
  const title = String(body.title || "").trim();
  const type = String(body.type || "").trim() as AnnouncementType;
  const body_text = body.body_text ?? null;
  const media_url = body.media_url ?? null;
  const link_url = body.link_url ?? null;
  const position = Number.isFinite(body.position) ? Number(body.position) : 1;
  const is_active = typeof body.is_active === "boolean" ? body.is_active : true;
  const starts_at = body.starts_at ? String(body.starts_at).trim() : null;
  const ends_at = body.ends_at ? String(body.ends_at).trim() : null;

  if (!title) return json({ ok: false, error: "missing_title" }, 400);

  const allowedTypes = new Set(["text", "image", "video"]);
  if (!type || !allowedTypes.has(type)) {
    return json({ ok: false, error: "invalid_type", allowed: Array.from(allowedTypes) }, 400);
  }
  if (position < 1 || position > 100) {
    return json({ ok: false, error: "invalid_position", detail: "position deve ser entre 1 e 100." }, 400);
  }
  if (starts_at && !isValidISODate(starts_at)) {
    return json({ ok: false, error: "invalid_starts_at", detail: "starts_at deve ser ISO valido." }, 400);
  }
  if (ends_at && !isValidISODate(ends_at)) {
    return json({ ok: false, error: "invalid_ends_at", detail: "ends_at deve ser ISO valido." }, 400);
  }

  if (type === "text") {
    if (!String(body_text || "").trim()) {
      return json({ ok: false, error: "missing_body_text", detail: "Para type=text, body_text e obrigatorio." }, 400);
    }
  } else if (!String(media_url || "").trim()) {
    return json({ ok: false, error: "missing_media_url", detail: "Para type=image/video, media_url e obrigatorio." }, 400);
  }

  const payload: Record<string, unknown> = {
    church_totvs_id: session.active_totvs_id,
    title,
    type,
    body_text,
    media_url,
    link_url,
    position,
    starts_at,
    ends_at,
    is_active,
  };

  if (id) {
    const { data: existing, error: findError } = await sb
      .from("announcements")
      .select("id, church_totvs_id")
      .eq("id", id)
      .maybeSingle();

    if (findError) return json({ ok: false, error: "db_error_find", details: findError.message }, 500);
    if (!existing) return json({ ok: false, error: "not_found" }, 404);
    if (String(existing.church_totvs_id) !== String(session.active_totvs_id)) {
      return json({ ok: false, error: "forbidden_wrong_church" }, 403);
    }

    const { data: updated, error: updateError } = await sb
      .from("announcements")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) return json({ ok: false, error: "db_error_update", details: updateError.message }, 500);
    return json({ ok: true, announcement: updated }, 200);
  }

  const { data: created, error: insertError } = await sb.from("announcements").insert(payload).select("*").single();
  if (insertError) return json({ ok: false, error: "db_error_insert", details: insertError.message }, 500);
  return json({ ok: true, announcement: created }, 200);
}

async function actionDelete(sb: ReturnType<typeof createClient>, req: Request, body: Body) {
  const session = await verifySessionJWT(req);
  if (!session) return json({ ok: false, error: "unauthorized" }, 401);
  if (session.role === "obreiro") return json({ ok: false, error: "forbidden" }, 403);

  const id = String(body.id || "").trim();
  if (!id) return json({ ok: false, error: "missing_id" }, 400);

  const { data: existing, error: findError } = await sb
    .from("announcements")
    .select("id, church_totvs_id")
    .eq("id", id)
    .maybeSingle();

  if (findError) return json({ ok: false, error: "db_error_find", details: findError.message }, 500);
  if (!existing) return json({ ok: false, error: "not_found" }, 404);
  if (String(existing.church_totvs_id) !== String(session.active_totvs_id)) {
    return json({ ok: false, error: "forbidden_wrong_church" }, 403);
  }

  const { error: deleteError } = await sb.from("announcements").delete().eq("id", id);
  if (deleteError) return json({ ok: false, error: "db_error_delete", details: deleteError.message }, 500);
  return json({ ok: true, deleted_id: id }, 200);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const action = String(body.action || "").trim() as Action;
    const sb = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

    const forwardedSlug = FORWARDED_ACTIONS[action];
    if (forwardedSlug) return await forwardToLegacy(req, body, forwardedSlug);
    if (action === "list") return await actionList(sb, req, body);
    if (action === "upsert") return await actionUpsert(sb, req, body);
    if (action === "delete") return await actionDelete(sb, req, body);

    return json(
      {
        ok: false,
        error: "invalid_action",
        allowed: [
          "list",
          "list-public",
          "list-admin",
          "upsert",
          "delete",
          "list-events",
          "upsert-event",
          "delete-event",
          "list-events-public",
          "list-banners",
          "upsert-banner",
          "delete-banner",
          "list-banners-public",
        ],
      },
      400,
    );
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
