import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

const N8N_WEBHOOK_URL = "https://n8n-n8n.ynlng8.easypanel.host/webhook/cartas-ipda";

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
type ChurchClass = "estadual" | "setorial" | "central" | "regional" | "local";
type PreachPeriod = "MANHA" | "TARDE" | "NOITE";

type SessionClaims = {
  user_id: string;
  role: Role;
  active_totvs_id: string;
};

type Body = {
  preacher_name?: string;
  minister_role?: string;
  preach_date?: string;
  preach_period?: PreachPeriod;
  church_origin?: string;
  church_destination?: string; // Ex.: "9639 - PEDRA AZUL"
  preacher_user_id?: string | null;
  phone?: string | null;
  email?: string | null;
};

type ChurchNode = {
  totvs_id: string;
  parent_totvs_id: string | null;
  church_name: string | null;
  class: ChurchClass | null;
  stamp_church_url: string | null;
  pastor_user_id: string | null;
};

function normalizeClass(v: unknown): ChurchClass | null {
  const s = String(v || "").toLowerCase().trim();
  if (s === "estadual" || s === "setorial" || s === "central" || s === "regional" || s === "local") return s;
  return null;
}

function parseTotvsFromText(value: string): string {
  const m = String(value || "").trim().match(/^(\d{3,})\b/);
  return m ? m[1] : "";
}

function mapById(churches: ChurchNode[]) {
  const byId = new Map<string, ChurchNode>();
  for (const c of churches) byId.set(c.totvs_id, c);
  return byId;
}

function computeScope(rootTotvs: string, churches: ChurchNode[]): Set<string> {
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

function collectAncestors(startTotvs: string, churches: ChurchNode[]): Set<string> {
  const byId = mapById(churches);
  const out = new Set<string>();
  let cur: string | null = startTotvs;
  const seen = new Set<string>();

  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const row = byId.get(cur);
    if (!row) break;
    const parent = row.parent_totvs_id ? String(row.parent_totvs_id) : "";
    if (parent) out.add(parent);
    cur = parent || null;
  }
  return out;
}

function findFirstAncestorByClass(startTotvs: string, churches: ChurchNode[], targetClass: ChurchClass): ChurchNode | null {
  const byId = mapById(churches);
  let cur = byId.get(startTotvs)?.parent_totvs_id || null;
  const seen = new Set<string>();

  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const row = byId.get(cur);
    if (!row) return null;
    if (row.class === targetClass) return row;
    cur = row.parent_totvs_id || null;
  }
  return null;
}

function resolveAllowedOriginTotvs(session: SessionClaims, activeChurch: ChurchNode, churches: ChurchNode[]): Set<string> {
  // Comentario: regra por classe para "Igreja que faz a carta (origem)".
  // - estadual: estadual
  // - setorial: setorial + estadual
  // - central: central + setorial + estadual
  // - regional/local: central do escopo
  // - obreiro: somente a igreja ativa
  const allowed = new Set<string>();
  const byId = mapById(churches);
  const activeTotvs = session.active_totvs_id;
  const activeClass = activeChurch.class;

  if (session.role === "obreiro") {
    allowed.add(activeTotvs);
    return allowed;
  }

  if (!activeClass) {
    allowed.add(activeTotvs);
    return allowed;
  }

  if (activeClass === "estadual") {
    allowed.add(activeTotvs);
    return allowed;
  }

  if (activeClass === "setorial") {
    allowed.add(activeTotvs);
    const estadual = findFirstAncestorByClass(activeTotvs, churches, "estadual");
    if (estadual) allowed.add(estadual.totvs_id);
    return allowed;
  }

  if (activeClass === "central") {
    allowed.add(activeTotvs);
    const setorial = findFirstAncestorByClass(activeTotvs, churches, "setorial");
    if (setorial) allowed.add(setorial.totvs_id);
    const estadual = findFirstAncestorByClass(activeTotvs, churches, "estadual");
    if (estadual) allowed.add(estadual.totvs_id);
    return allowed;
  }

  if (activeClass === "regional" || activeClass === "local") {
    const central = findFirstAncestorByClass(activeTotvs, churches, "central");
    if (central) {
      allowed.add(central.totvs_id);
      return allowed;
    }
    // Comentario: fallback defensivo se a arvore estiver incompleta.
    allowed.add(activeTotvs);
    return allowed;
  }

  // Comentario: fallback geral.
  if (byId.has(activeTotvs)) allowed.add(activeTotvs);
  return allowed;
}

function findFirstAncestorByClassWithPastor(startTotvs: string, churches: ChurchNode[], targetClass: ChurchClass): ChurchNode | null {
  const byId = mapById(churches);
  let cur = byId.get(startTotvs)?.parent_totvs_id || null;
  const seen = new Set<string>();

  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const row = byId.get(cur);
    if (!row) return null;
    if (row.class === targetClass && String(row.pastor_user_id || "").trim()) return row;
    cur = row.parent_totvs_id || null;
  }
  return null;
}

// Regras de assinatura:
// estadual -> pastor estadual
// setorial -> pastor setorial
// central -> pastor central
// regional/local -> pastor central
function resolveSignerChurch(activeTotvsId: string, churches: ChurchNode[]): ChurchNode | null {
  const byId = mapById(churches);
  const active = byId.get(activeTotvsId) || null;
  if (!active || !active.class) return null;

  const cls = active.class;

  if (cls === "regional" || cls === "local") {
    return findFirstAncestorByClassWithPastor(activeTotvsId, churches, "central");
  }

  if (String(active.pastor_user_id || "").trim()) return active;

  // fallback: tentar encontrar acima da mesma classe (se existir no seu desenho)
  let cur = active.parent_totvs_id || null;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const row = byId.get(cur);
    if (!row) break;
    if (row.class === cls && String(row.pastor_user_id || "").trim()) return row;
    cur = row.parent_totvs_id || null;
  }

  return null;
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
    if (!user_id || !active_totvs_id) return null;
    if (!["admin", "pastor", "obreiro"].includes(role)) return null;
    return { user_id, role, active_totvs_id };
  } catch {
    return null;
  }
}

function parseDateYYYYMMDD(s: string): Date | null {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function lastDayOfCurrentMonthUTC(today: Date): Date {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;

    const preach_date_str = String(body.preach_date || "").trim();
    const church_origin = String(body.church_origin || "").trim();
    const church_destination = String(body.church_destination || "").trim();

    const preach_period = String(body.preach_period || "NOITE").trim().toUpperCase() as PreachPeriod;
    if (!["MANHA", "TARDE", "NOITE"].includes(preach_period)) return json({ ok: false, error: "invalid_preach_period" }, 400);

    if (!preach_date_str) return json({ ok: false, error: "missing_preach_date" }, 400);
    if (!church_origin) return json({ ok: false, error: "missing_church_origin" }, 400);
    if (!church_destination) return json({ ok: false, error: "missing_church_destination" }, 400);

    const preachDate = parseDateYYYYMMDD(preach_date_str);
    if (!preachDate) return json({ ok: false, error: "invalid_preach_date_format" }, 400);

    const today = todayUTC();
    const maxDate = lastDayOfCurrentMonthUTC(today);

    if (preachDate.getTime() < today.getTime()) return json({ ok: false, error: "preach_date_in_past" }, 400);
    if (preachDate.getTime() > maxDate.getTime()) {
      return json({ ok: false, error: "preach_date_out_of_current_month", max_date: maxDate.toISOString().slice(0, 10) }, 400);
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: churchesRaw, error: churchesErr } = await sb
      .from("churches")
      .select("totvs_id,parent_totvs_id,church_name,class,stamp_church_url,pastor_user_id");

    if (churchesErr) return json({ ok: false, error: "db_error_church_tree", details: churchesErr.message }, 500);

    const churches: ChurchNode[] = ((churchesRaw || []) as Record<string, unknown>[]).map((r) => ({
      totvs_id: String(r.totvs_id || ""),
      parent_totvs_id: r.parent_totvs_id ? String(r.parent_totvs_id) : null,
      church_name: r.church_name ? String(r.church_name) : null,
      class: normalizeClass(r.class),
      stamp_church_url: r.stamp_church_url ? String(r.stamp_church_url) : null,
      pastor_user_id: r.pastor_user_id ? String(r.pastor_user_id) : null,
    }));

    const byId = mapById(churches);
    const activeChurch = byId.get(session.active_totvs_id) || null;
    if (!activeChurch) return json({ ok: false, error: "church_not_found" }, 404);

    // Comentario: origem permitida segue regra de classe por hierarquia.
    const originTotvs = parseTotvsFromText(church_origin) || session.active_totvs_id;
    let church_totvs_id = originTotvs;

    if (!byId.has(church_totvs_id)) {
      return json({ ok: false, error: "origin_church_not_found" }, 404);
    }

    const allowedOrigins = resolveAllowedOriginTotvs(session, activeChurch, churches);
    if (!allowedOrigins.has(church_totvs_id)) {
      return json({
        ok: false,
        error: "origin_out_of_allowed",
        detail: "Origem invalida para sua classe. Use sua igreja permitida na hierarquia.",
        allowed_origins: [...allowedOrigins],
      }, 403);
    }

    // Destino permitido = escopo (filhas) + ancestrais (mãe, avó, bisavó...)
    const scope = computeScope(church_totvs_id, churches);
    const ancestors = collectAncestors(church_totvs_id, churches);
    const allowedDestinations = new Set<string>([...scope, ...ancestors]);

    const destinationTotvs = parseTotvsFromText(church_destination);
    if (!destinationTotvs) {
      return json({ ok: false, error: "destination_totvs_required", detail: "Selecione a igreja destino da lista com TOTVS." }, 400);
    }

    if (!allowedDestinations.has(destinationTotvs)) {
      return json({
        ok: false,
        error: "destination_out_of_scope_use_parent",
        detail: "Voce nao pode tirar carta para uma classe acima de voce. Procure o pastor da igreja mae.",
      }, 403);
    }

    // Resolve assinante pela regra fixa de classe
    const signerChurch = resolveSignerChurch(church_totvs_id, churches);
    if (!signerChurch) return json({ ok: false, error: "signer_not_found_for_class_rule" }, 409);

    const signerPastorId = String(signerChurch.pastor_user_id || "").trim();
    if (!signerPastorId) return json({ ok: false, error: "signer_pastor_not_defined" }, 409);

    const { data: pastorUser, error: pErr } = await sb
      .from("users")
      .select("id, full_name, phone, email, signature_url, stamp_pastor_url")
      .eq("id", signerPastorId)
      .maybeSingle();

    if (pErr) return json({ ok: false, error: "db_error_pastor", details: pErr.message }, 500);
    if (!pastorUser) return json({ ok: false, error: "pastor_not_found" }, 404);

    // Comentario: dados de quem esta logado e emitindo a carta.
    const { data: actorUser } = await sb
      .from("users")
      .select("id, full_name, phone, email, minister_role")
      .eq("id", session.user_id)
      .maybeSingle();

    // Comentario: dados do pastor da igreja de origem escolhida.
    const originChurch = byId.get(church_totvs_id) || null;
    const originPastorId = String(originChurch?.pastor_user_id || "").trim();
    let originPastorUser: Record<string, unknown> | null = null;
    if (originPastorId) {
      const { data } = await sb
        .from("users")
        .select("id, full_name, phone, email")
        .eq("id", originPastorId)
        .maybeSingle();
      originPastorUser = (data as Record<string, unknown> | null) || null;
    }

    // Limite semanal por igreja emissora
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: last7Count, error: cntErr } = await sb
      .from("letters")
      .select("id", { count: "exact", head: true })
      .eq("church_totvs_id", church_totvs_id)
      .gte("created_at", since)
      .neq("status", "EXCLUIDA");

    if (cntErr) return json({ ok: false, error: "db_error_count", details: cntErr.message }, 500);
    if ((last7Count || 0) >= 5) return json({ ok: false, error: "weekly_limit_reached" }, 403);

    let preacher_user_id: string | null = body.preacher_user_id ?? null;
    let preacher_name = String(body.preacher_name || "").trim();
    let minister_role = String(body.minister_role || "").trim();
    let preacher_phone = String(body.phone || "").trim() || null;
    let preacher_email = String(body.email || "").trim() || null;

    // Regra: inicia BLOQUEADO para todos; libera direto se can_create_released_letter=true do pregador
    let status = "BLOQUEADO";
    let canDirectRelease = false;

    if (session.role === "obreiro") {
      const { data: me, error: meErr } = await sb
        .from("users")
        .select("id, full_name, minister_role, phone, email, can_create_released_letter")
        .eq("id", session.user_id)
        .maybeSingle();

      if (meErr) return json({ ok: false, error: "db_error_me", details: meErr.message }, 500);
      if (!me) return json({ ok: false, error: "me_not_found" }, 404);

      preacher_user_id = String(me.id);
      preacher_name = String(me.full_name || "").trim();
      minister_role = String(me.minister_role || "").trim();
      preacher_phone = String((me as Record<string, unknown>).phone || "").trim() || null;
      preacher_email = String((me as Record<string, unknown>).email || "").trim() || null;

      if (!preacher_name) return json({ ok: false, error: "missing_preacher_name_in_profile" }, 400);
      if (!minister_role) return json({ ok: false, error: "missing_minister_role_in_profile" }, 400);

      canDirectRelease = Boolean((me as Record<string, unknown>).can_create_released_letter);
    } else {
      if (!preacher_name) return json({ ok: false, error: "missing_preacher_name" }, 400);
      if (!minister_role) return json({ ok: false, error: "missing_minister_role" }, 400);

      // fallback obrigatório para nunca ficar NULL
      if (!preacher_user_id) preacher_user_id = session.user_id;

      const { data: target, error: targetErr } = await sb
        .from("users")
        .select("id, phone, email, can_create_released_letter")
        .eq("id", preacher_user_id)
        .maybeSingle();

      if (targetErr) return json({ ok: false, error: "db_error_target_user", details: targetErr.message }, 500);
      canDirectRelease = Boolean((target as Record<string, unknown> | null)?.can_create_released_letter);
      if (!preacher_phone) preacher_phone = String((target as Record<string, unknown> | null)?.phone || "").trim() || null;
      if (!preacher_email) preacher_email = String((target as Record<string, unknown> | null)?.email || "").trim() || null;
    }

    if (canDirectRelease) status = "LIBERADA";

    const { data: dup, error: dupErr } = await sb
      .from("letters")
      .select("id")
      .eq("church_totvs_id", church_totvs_id)
      .eq("preacher_name", preacher_name)
      .eq("preach_date", preach_date_str)
      .eq("preach_period", preach_period)
      .neq("status", "EXCLUIDA")
      .limit(1);

    if (dupErr) return json({ ok: false, error: "db_error_duplicate_check", details: dupErr.message }, 500);
    if (dup && dup.length > 0) {
      return json({ ok: false, error: "duplicate_letter_same_day_period", preach_period, letter_id: dup[0].id }, 409);
    }

    const { data: created, error: insErr } = await sb
      .from("letters")
      .insert({
        church_totvs_id,
        preacher_user_id, // nunca null
        preacher_name,
        minister_role,
        preach_date: preach_date_str,
        preach_period,
        church_origin,
        church_destination,
        phone: preacher_phone,
        email: preacher_email,
        storage_path: null,
        status,
        signer_user_id: signerPastorId,
        signer_totvs_id: signerChurch.totvs_id,
      })
      .select("id, church_totvs_id, preacher_user_id, preacher_name, minister_role, preach_date, preach_period, church_origin, church_destination, status, created_at")
      .single();

    if (insErr) return json({ ok: false, error: "insert_failed", details: insErr.message }, 400);

    const n8nPayload = {
      action: "create_letter",
      letter_id: created.id,
      church_totvs_id: created.church_totvs_id,
      preacher_user_id: created.preacher_user_id,
      preacher_name: created.preacher_name,
      minister_role: created.minister_role,
      preach_date: created.preach_date,
      preach_period: created.preach_period,
      church_origin: created.church_origin,
      church_destination: created.church_destination,
      phone: preacher_phone,
      email: preacher_email,
      created_by_user_id: session.user_id,
      created_by_role: session.role,
      actor_user: {
        id: String((actorUser as Record<string, unknown> | null)?.id || session.user_id),
        full_name: String((actorUser as Record<string, unknown> | null)?.full_name || ""),
        phone: String((actorUser as Record<string, unknown> | null)?.phone || "") || null,
        email: String((actorUser as Record<string, unknown> | null)?.email || "") || null,
        minister_role: String((actorUser as Record<string, unknown> | null)?.minister_role || "") || null,
      },
      origin_church: {
        totvs_id: church_totvs_id,
        church_name: originChurch?.church_name || null,
        church_class: originChurch?.class || null,
      },
      origin_pastor: {
        id: originPastorId || null,
        full_name: String(originPastorUser?.full_name || "") || null,
        phone: String(originPastorUser?.phone || "") || null,
        email: String(originPastorUser?.email || "") || null,
      },
      signature_url: (pastorUser as Record<string, unknown>).signature_url ?? null,
      stamp_pastor_url: (pastorUser as Record<string, unknown>).stamp_pastor_url ?? null,
      stamp_church_url: signerChurch.stamp_church_url ?? null,
      pastor_name: (pastorUser as Record<string, unknown>).full_name ?? null,
      pastor_phone: (pastorUser as Record<string, unknown>).phone ?? null,
      pastor_email: (pastorUser as Record<string, unknown>).email ?? null,
      church_name: signerChurch.church_name ?? null,
      signer_totvs_id: signerChurch.totvs_id,
      signer_class: signerChurch.class,
      issued_at: created.created_at,
    };

    let n8nOk = false;
    let n8nStatus = 0;
    let n8nResponse: unknown = null;

    // Só dispara quando estiver liberada
    // Comentario: sempre envia para geracao do PDF.
    // A liberacao para visualizar/compartilhar continua pela regra de status/url_pronta.
    try {
      const resp = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(n8nPayload),
      });
      n8nStatus = resp.status;
      const text = await resp.text();
      try {
        n8nResponse = JSON.parse(text);
      } catch {
        n8nResponse = { raw: text };
      }
      n8nOk = resp.ok;
    } catch (e) {
      n8nOk = false;
      n8nResponse = { error: String(e) };
    }

    // Comentario: gera notificacao para o pastor assinante e para o feed da igreja.
    const notificationTitle = status === "LIBERADA" ? "Carta liberada criada" : "Nova carta aguardando liberacao";
    const notificationMessage = `${preacher_name} - ${created.preach_date} (${created.preach_period})`;
    try {
      await sb.from("notifications").insert([
        {
          church_totvs_id,
          user_id: signerPastorId,
          type: "LETTER_CREATED",
          title: notificationTitle,
          message: notificationMessage,
          is_read: false,
          related_id: String(created.id),
          data: {
            letter_id: created.id,
            status: created.status,
            preacher_name,
            preacher_user_id,
            phone: preacher_phone,
            email: preacher_email,
          },
        },
        {
          church_totvs_id,
          user_id: null,
          type: "LETTER_CREATED",
          title: notificationTitle,
          message: notificationMessage,
          is_read: false,
          related_id: String(created.id),
          data: {
            letter_id: created.id,
            status: created.status,
            preacher_name,
            preacher_user_id,
          },
        },
      ]);
    } catch {
      // Comentario: notificacao nao pode quebrar criacao da carta.
    }

return json({ ok: true, letter: created, n8n: { ok: n8nOk, status: n8nStatus, response: n8nResponse } }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
