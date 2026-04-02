/**
 * letters-api
 * ===========
 * Funcao consolidada que unifica todas as operacoes de cartas de pregacao.
 * Roteamento feito pelo campo "action" no body da requisicao POST.
 *
 * Actions disponíveis:
 *   "create"          -> cria uma nova carta (antigo create-letter)
 *   "list"            -> lista cartas com filtros e paginacao (antigo list-letters)
 *   "get-pdf-url"     -> obtem a URL do PDF de uma carta (antigo get-letter-pdf-url)
 *   "set-status"      -> altera o status de uma carta (antigo set-letter-status)
 *   "manage"          -> compatibilidade legada para release/share/delete
 *   "approve-release" -> aprova uma solicitacao de liberacao (antigo approve-release)
 *
 * Todas as actions exigem autenticacao via JWT customizado (USER_SESSION_JWT_SECRET),
 * exceto verificacao de OPTIONS (CORS preflight).
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";
import { insertNotification, sendInternalPushNotification } from "../_shared/push.ts";

// URL do webhook N8N que gera o PDF da carta de pregacao
const N8N_WEBHOOK_URL = Deno.env.get("N8N_LETTER_WEBHOOK_URL")
  || Deno.env.get("N8N_WEBHOOK_CARTA_PREGACAO")
  || "";

// ---------------------------------------------------------------------------
// FUNCOES UTILITARIAS COMPARTILHADAS
// Extraídas dos handlers originais — sem duplicacao.
// Inclui: corsHeaders, json, tipos, computeScope, resolveSignerChurch,
//         formatDMY, formatExtended, churchNameOnly, parseTotvsFromText, etc.
// ---------------------------------------------------------------------------

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

type Role = "admin" | "pastor" | "obreiro" | "secretario" | "financeiro";
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
  destination_totvs_id?: string | null;
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
  address_city: string | null;
  address_state: string | null;
};

/** Estrutura reduzida de Igreja para calculos de escopo */
type ChurchRow = { totvs_id: string; parent_totvs_id: string | null };

function normalizeClass(v: unknown): ChurchClass | null {
  const s = String(v || "").toLowerCase().trim();
  if (s === "estadual" || s === "setorial" || s === "central" || s === "regional" || s === "local") return s;
  return null;
}

function parseTotvsFromText(value: string): string {
  const m = String(value || "").trim().match(/^(\d{3,})\b/);
  return m ? m[1] : "";
}

function isUuid(value: string | null | undefined): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function resolveRegistrationStatusFromTotvsAccess(totvsAccess: unknown, preferredTotvsId?: string | null): string | null {
  if (!Array.isArray(totvsAccess)) return null;

  const preferred = String(preferredTotvsId || "").trim();
  for (const item of totvsAccess) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const entryTotvs = String(entry.totvs_id || "").trim();
    const status = String(entry.registration_status || "").trim().toUpperCase();
    if (preferred && entryTotvs !== preferred) continue;
    if (status === "PENDENTE" || status === "APROVADO") return status;
  }

  for (const item of totvsAccess) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const status = String(entry.registration_status || "").trim().toUpperCase();
    if (status === "PENDENTE" || status === "APROVADO") return status;
  }

  return null;
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

function findTopAncestorTotvs(startTotvs: string, churches: ChurchNode[]): string {
  const byId = mapById(churches);
  let cur: string | null = startTotvs;
  const seen = new Set<string>();
  let last = startTotvs;

  while (cur && !seen.has(cur)) {
    seen.add(cur);
    last = cur;
    const row = byId.get(cur);
    if (!row) break;
    cur = row.parent_totvs_id ? String(row.parent_totvs_id) : null;
  }

  return last;
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
  // Comentario: regra simplificada para manter compatibilidade com as telas atuais.
  // Todos os perfis podem usar a igreja ativa e as maes acima dela como origem.
  // Isso acompanha o comportamento atual das telas, que sobem a assinatura/origem
  // para a mae quando necessario.
  const allowed = new Set<string>();
  const activeTotvs = session.active_totvs_id;

  allowed.add(activeTotvs);
  for (const ancestor of collectAncestors(activeTotvs, churches)) {
    allowed.add(ancestor);
  }
  if (activeChurch.class === "regional" || activeChurch.class === "local") {
    const central = findFirstAncestorByClass(activeTotvs, churches, "central");
    if (central) allowed.add(central.totvs_id);
  }
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
    const rawRole = String(payload.role || "").toLowerCase();
    const appRole = String(payload.app_role || "").toLowerCase();
    const resolvedRole = rawRole === "authenticated" ? appRole : rawRole;
    const role = resolvedRole as Role;
    const active_totvs_id = String(payload.active_totvs_id || "");
    if (!user_id || !active_totvs_id) return null;
    if (!["admin", "pastor", "obreiro", "secretario", "financeiro"].includes(role)) return null;
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

/** "2026-03-25" → "25/03/2026" */
function formatDMY(s: string): string {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const PT_MONTHS = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

/** "2026-03-16T..." → "16 de março de 2026" */
function formatExtended(isoStr: string): string {
  const m = String(isoStr || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return isoStr;
  return `${parseInt(m[3], 10)} de ${PT_MONTHS[parseInt(m[2], 10) - 1]} de ${m[1]}`;
}

/** "7705 - MANAUS - APARECIDA" → "MANAUS - APARECIDA" */
function churchNameOnly(text: string): string {
  const idx = text.indexOf(" - ");
  return idx >= 0 ? text.slice(idx + 3).trim() : text.trim();
}

// Utilitarios de Storage (de get-letter-pdf-url)
function normalizeStoragePath(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw || raw === "true" || raw === "false" || raw === "null" || raw === "undefined") return "";
  const noSlash = raw.replace(/^\/+/, "");
  // Comentario: em alguns registros veio com prefixo do bucket.
  return noSlash.replace(/^cartas\//i, "").replace(/^public\/cartas\//i, "");
}

function buildPathCandidates(path: string): string[] {
  const base = path.trim().replace(/^\/+/, "");
  if (!base) return [];
  const out = new Set<string>([base]);
  if (base.startsWith("cartas/")) out.add(base.replace(/^cartas\//, ""));
  else out.add(`cartas/${base}`);
  return [...out];
}

// Helpers de filtro por data (de list-letters)
function startOfDayISO(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0)).toISOString();
}
function endOfDayISO(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59)).toISOString();
}
function todayYMD() {
  return new Date().toISOString().slice(0, 10);
}

function toTrimmed(value: unknown): string {
  return String(value || "").trim();
}

function collectIncompleteProfileFields(row: Record<string, unknown> | null): string[] {
  if (!row) return ["cadastro do membro"];

  const checks: Array<{ key: string; label: string }> = [
    { key: "baptism_date", label: "data de batismo" },
    { key: "avatar_url", label: "foto" },
    { key: "address_street", label: "rua" },
    { key: "address_number", label: "numero" },
    { key: "address_neighborhood", label: "bairro" },
    { key: "address_city", label: "cidade" },
    { key: "address_state", label: "estado" },
  ];

  const missing: string[] = [];
  for (const check of checks) {
    if (!toTrimmed(row[check.key])) missing.push(check.label);
  }
  return missing;
}

function buildIncompleteProfileDetail(missingFields: string[]): string {
  const fields = missingFields.join(", ");
  return `Complete os seus dados para continuar emitindo cartas. Campos pendentes: ${fields}.`;
}

async function enrichLettersWithPreacherChurch(
  sb: ReturnType<typeof createClient>,
  letters: Record<string, unknown>[],
) {
  const preacherIds = Array.from(
    new Set(
      letters
        .map((letter) => String(letter.preacher_user_id || "").trim())
        .filter(Boolean),
    ),
  );

  const fallbackChurchIds = Array.from(
    new Set(
      letters
        .map((letter) => String(letter.church_totvs_id || "").trim())
        .filter(Boolean),
    ),
  );

  if (preacherIds.length === 0 && fallbackChurchIds.length === 0) return letters;

  let users: Array<Record<string, unknown>> = [];
  if (preacherIds.length > 0) {
    const { data, error: usersErr } = await sb
      .from("users")
      .select("id, default_totvs_id")
      .in("id", preacherIds);
    if (!usersErr && data) users = data as Array<Record<string, unknown>>;
  }

  const userChurchMap = new Map(
    users.map((row: Record<string, unknown>) => [
      String(row.id || ""),
      String(row.default_totvs_id || "").trim(),
    ]),
  );

  const churchIds = Array.from(
    new Set(
      [
        ...users
          .map((row: Record<string, unknown>) => String(row.default_totvs_id || "").trim())
          .filter(Boolean),
        ...fallbackChurchIds,
      ],
    ),
  );

  if (churchIds.length === 0) return letters;

  const { data: churches, error: churchesErr } = await sb
    .from("churches")
    .select("totvs_id, church_name")
    .in("totvs_id", churchIds);

  if (churchesErr || !churches) return letters;

  const churchNameById = new Map(
    (churches || []).map((row: Record<string, unknown>) => [
      String(row.totvs_id || ""),
      String(row.church_name || "").trim(),
    ]),
  );

  return letters.map((letter) => {
    const preacherId = String(letter.preacher_user_id || "").trim();
    const totvsId = preacherId
      ? userChurchMap.get(preacherId) || ""
      : String(letter.church_totvs_id || "").trim();
    const churchName = totvsId ? churchNameById.get(totvsId) || "" : "";
    return {
      ...letter,
      preacher_church_totvs_id: totvsId || null,
      preacher_church_name: churchName || null,
    };
  });
}

// ---------------------------------------------------------------------------
// HANDLER: create  (logica original de create-letter/index.ts)
// ---------------------------------------------------------------------------
async function handleCreate(session: SessionClaims, body: Record<string, unknown>): Promise<Response> {


    const preach_date_str = String(body.preach_date || "").trim();
    let church_origin = String(body.church_origin || "").trim();
    let church_destination = String(body.church_destination || "").trim();
    const manual_destination = Boolean(body.manual_destination);

    const preach_period = String(body.preach_period || "NOITE").trim().toUpperCase() as PreachPeriod;
    if (!["MANHA", "TARDE", "NOITE"].includes(preach_period)) return json({ ok: false, error: "invalid_preach_period" }, 400);

    if (!preach_date_str) return json({ ok: false, error: "missing_preach_date" }, 400);
    if (!church_origin) return json({ ok: false, error: "missing_church_origin" }, 400);
    if (!church_destination) return json({ ok: false, error: "missing_church_destination" }, 400);

    const preachDate = parseDateYYYYMMDD(preach_date_str);
    if (!preachDate) return json({ ok: false, error: "invalid_preach_date_format" }, 400);

    const today = todayUTC();
    if (preachDate.getTime() < today.getTime()) return json({ ok: false, error: "preach_date_in_past" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: churchesRaw, error: churchesErr } = await sb
      .from("churches")
      .select("totvs_id,parent_totvs_id,church_name,class,stamp_church_url,pastor_user_id,address_city,address_state");

    if (churchesErr) return json({ ok: false, error: "db_error_church_tree", details: churchesErr.message }, 500);

    const churches: ChurchNode[] = ((churchesRaw || []) as Record<string, unknown>[]).map((r) => ({
      totvs_id: String(r.totvs_id || ""),
      parent_totvs_id: r.parent_totvs_id ? String(r.parent_totvs_id) : null,
      church_name: r.church_name ? String(r.church_name) : null,
      class: normalizeClass(r.class),
      stamp_church_url: r.stamp_church_url ? String(r.stamp_church_url) : null,
      pastor_user_id: r.pastor_user_id ? String(r.pastor_user_id) : null,
      address_city: r.address_city ? String(r.address_city) : null,
      address_state: r.address_state ? String(r.address_state) : null,
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

    // Regra: se o destino for manual, a origem sempre sobe para o topo da hierarquia (avó).
    if (manual_destination) {
      const topTotvs = findTopAncestorTotvs(church_totvs_id, churches);
      if (topTotvs && topTotvs !== church_totvs_id) {
        church_totvs_id = topTotvs;
        const topChurch = byId.get(topTotvs) || null;
        const topName = String(topChurch?.church_name || "").trim();
        if (topName) church_origin = `${topTotvs} - ${topName}`;
      }
    }

    const allowedOrigins = resolveAllowedOriginTotvs(session, activeChurch, churches);
    if (!allowedOrigins.has(church_totvs_id)) {
      // Removido: campo allowed_origins que expunha a hierarquia de igrejas do usuario.
      // Um atacante podia usar esse erro para mapear quais igrejas pertencem ao escopo.
      return json({
        ok: false,
        error: "origin_out_of_allowed",
        detail: "Origem invalida para sua hierarquia. Use sua igreja ou a igreja mae permitida.",
      }, 403);
    }

    // Destino permitido = escopo (filhas) + ancestrais (mãe, avó, bisavó...)
    let scope = computeScope(church_totvs_id, churches);
    let ancestors = collectAncestors(church_totvs_id, churches);
    let allowedDestinations = new Set<string>([...scope, ...ancestors]);

    const destinationTotvsExplicit = String(body.destination_totvs_id || "").trim();
    const destinationTotvs = destinationTotvsExplicit || parseTotvsFromText(church_destination);
    if (!destinationTotvs && !manual_destination) {
      return json({ ok: false, error: "destination_totvs_required", detail: "Selecione a igreja destino da lista com TOTVS." }, 400);
    }

    if (destinationTotvs) {
      const destinationChurch = byId.get(destinationTotvs) || null;
      if (destinationChurch) {
        const destinationName = String(destinationChurch.church_name || "").trim() || churchNameOnly(church_destination) || destinationTotvs;
        church_destination = `${destinationTotvs} - ${destinationName}`;
      }
    }

    if (destinationTotvs && !allowedDestinations.has(destinationTotvs) && !manual_destination) {
      // Regra: se a igreja destino está acima, sobe a origem para a mãe/avó (topo da hierarquia).
      const topTotvs = findTopAncestorTotvs(church_totvs_id, churches);
      if (topTotvs && topTotvs !== church_totvs_id) {
        church_totvs_id = topTotvs;
        const topChurch = byId.get(topTotvs) || null;
        const topName = String(topChurch?.church_name || "").trim();
        if (topName) church_origin = `${topTotvs} - ${topName}`;
        scope = computeScope(church_totvs_id, churches);
        ancestors = collectAncestors(church_totvs_id, churches);
        allowedDestinations = new Set<string>([...scope, ...ancestors]);
      }
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
      .select("id, full_name, phone, email, minister_role, ordination_date, baptism_date, totvs_access")
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

    let preacher_user_id = String(body.preacher_user_id || "").trim() || null;
    let preacher_name = String(body.preacher_name || "").trim();
    let minister_role = String(body.minister_role || "").trim();
    let preacher_phone = String(body.phone || "").trim() || null;
    let preacher_email = String(body.email || "").trim() || null;
    let preacher_ministerial_date: string | null = null;
    let preacher_registration_status: string | null = null;
    let profileWarningDetail: string | null = null;

    // ─── REGRA DE LIBERAÇÃO AUTOMÁTICA ───────────────────────────────────────
    // Status inicial é sempre AGUARDANDO_LIBERACAO.
    // Só muda para LIBERADA se o pregador tiver can_create_released_letter = true
    // na tabela "users". Esse campo é configurado pelo administrador do sistema.
    //
    // Fluxo LIBERADA (automático):
    //   can_create_released_letter = true → status = LIBERADA → webhook dispara → PDF gerado
    //
    // Fluxo AGUARDANDO_LIBERACAO (aguarda liberação manual):
    //   can_create_released_letter = false → status = AGUARDANDO_LIBERACAO → sem webhook
    //   Pastor acessa o painel → clica "Liberar carta" → webhook dispara → PDF gerado
    // ─────────────────────────────────────────────────────────────────────────
    let status = "AGUARDANDO_LIBERACAO";
    let canDirectRelease = false;

    if (session.role === "obreiro") {
      // Obreiro cria carta para si mesmo: busca seus próprios dados na tabela users
      const { data: me, error: meErr } = await sb
        .from("users")
        .select("id, full_name, minister_role, phone, email, can_create_released_letter, ordination_date, baptism_date, avatar_url, address_street, address_number, address_neighborhood, address_city, address_state, totvs_access")
        .eq("id", session.user_id)
        .maybeSingle();

      if (meErr) return json({ ok: false, error: "db_error_me", details: meErr.message }, 500);
      if (!me) return json({ ok: false, error: "me_not_found" }, 404);

      preacher_user_id = String(me.id);
      preacher_name = String(me.full_name || "").trim();
      minister_role = String(me.minister_role || "").trim();
      preacher_phone = String((me as Record<string, unknown>).phone || "").trim() || null;
      preacher_email = String((me as Record<string, unknown>).email || "").trim() || null;
      preacher_ministerial_date =
        String((me as Record<string, unknown>).ordination_date || "").trim() ||
        String((me as Record<string, unknown>).baptism_date || "").trim() ||
        null;
      preacher_registration_status = resolveRegistrationStatusFromTotvsAccess(
        (me as Record<string, unknown>).totvs_access,
        church_totvs_id,
      );

      if (!preacher_name) return json({ ok: false, error: "missing_preacher_name_in_profile" }, 400);
      if (!minister_role) return json({ ok: false, error: "missing_minister_role_in_profile" }, 400);

      const missingFields = collectIncompleteProfileFields((me as Record<string, unknown>) || null);
      if (missingFields.length > 0) {
        profileWarningDetail = buildIncompleteProfileDetail(missingFields);
      }

      // ← DECISÃO DE LIBERAÇÃO: lê can_create_released_letter do próprio obreiro
      canDirectRelease = Boolean((me as Record<string, unknown>).can_create_released_letter);

    } else {
      // Pastor/admin criando carta para outro membro: recebe os dados pelo body
      if (!preacher_name) return json({ ok: false, error: "missing_preacher_name" }, 400);
      if (!minister_role) return json({ ok: false, error: "missing_minister_role" }, 400);

      // Se não informou preacher_user_id, usa o próprio usuário logado como pregador
      if (!preacher_user_id) preacher_user_id = session.user_id;

      // Busca dados do pregador na tabela users para verificar liberação automática
      let target: Record<string, unknown> | null = null;
      if (isUuid(preacher_user_id)) {
        const targetResult = await sb
          .from("users")
          .select("id, phone, email, can_create_released_letter, ordination_date, baptism_date, avatar_url, address_street, address_number, address_neighborhood, address_city, address_state, totvs_access")
          .eq("id", preacher_user_id)
          .maybeSingle();

        if (targetResult.error) return json({ ok: false, error: "db_error_target_user", details: targetResult.error.message }, 500);
        target = (targetResult.data as Record<string, unknown> | null) || null;
      }

      // ← DECISÃO DE LIBERAÇÃO: lê can_create_released_letter do pregador informado
      canDirectRelease = Boolean(target?.can_create_released_letter);

      const missingFields = collectIncompleteProfileFields(target);
      if (missingFields.length > 0) {
        profileWarningDetail = buildIncompleteProfileDetail(missingFields);
      }

      if (!preacher_phone) preacher_phone = String(target?.phone || "").trim() || null;
      if (!preacher_email) preacher_email = String(target?.email || "").trim() || null;
      preacher_ministerial_date =
        String(target?.ordination_date || "").trim() ||
        String(target?.baptism_date || "").trim() ||
        null;
      preacher_registration_status = resolveRegistrationStatusFromTotvsAccess(target?.totvs_access, church_totvs_id);

      // Fallback: usa dados do actor (pastor logado) se o target não tiver data_separacao
      if (!preacher_ministerial_date) {
        preacher_ministerial_date =
          String((actorUser as Record<string, unknown> | null)?.ordination_date || "").trim() ||
          String((actorUser as Record<string, unknown> | null)?.baptism_date || "").trim() ||
          null;
      }
      if (!preacher_registration_status) {
        preacher_registration_status = resolveRegistrationStatusFromTotvsAccess(
          (actorUser as Record<string, unknown> | null)?.totvs_access,
          church_totvs_id,
        );
      }
    }

    // Aplica a decisão: se can_create_released_letter = true, libera automaticamente
    if (canDirectRelease) status = "LIBERADA";

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

    const statusUsuario = preacher_registration_status === "APROVADO"
      ? "AUTORIZADO"
      : preacher_registration_status === "PENDENTE"
        ? "PENDENTE"
        : "AUTORIZADO";

    const n8nPayload = {
      letter_id: created.id,
      nome: preacher_name,
      telefone: preacher_phone ?? "",
      igreja_origem: created.church_origin,
      origem: created.church_origin,
      igreja_destino: created.church_destination,
      dia_pregacao: formatDMY(created.preach_date),
      data_emissao: formatExtended(created.created_at),
      origem_totvs: church_totvs_id,
      destino_totvs: destinationTotvs || "",
      origem_nome: originChurch?.church_name || churchNameOnly(created.church_origin),
      destino_nome: churchNameOnly(created.church_destination),
      email: preacher_email ?? "",
      ministerial: minister_role,
      data_separacao: preacher_ministerial_date ? formatDMY(preacher_ministerial_date) : "",
      pastor_responsavel: String((pastorUser as Record<string, unknown>).full_name ?? ""),
      telefone_pastor: String((pastorUser as Record<string, unknown>).phone ?? ""),
      assinatura_url: String((pastorUser as Record<string, unknown>).signature_url ?? ""),
      carimbo_igreja_url: signerChurch.stamp_church_url ?? "",
      carimbo_pastor_url: String((pastorUser as Record<string, unknown>).stamp_pastor_url ?? ""),
      cidade_igreja: originChurch?.address_city ?? "",
      uf_igreja: originChurch?.address_state ?? "",
      status_usuario: statusUsuario,
      status_carta: created.status,
      client_id: church_totvs_id,
      obreiro_id: preacher_user_id ?? "",
    };

    let n8nOk = false;
    let n8nStatus = 0;
    let n8nResponse: unknown = null;

    // Só dispara o webhook para cartas já liberadas (liberado automático).
    // Cartas em AGUARDANDO_LIBERACAO aguardam liberação manual; o webhook é disparado pelo approve-release ou set-letter-status.
    if (status === "LIBERADA") {
      try {
        if (!N8N_WEBHOOK_URL) throw new Error("missing_n8n_letter_webhook_url");
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
    }

    // Comentario: gera notificacao pessoal para o pastor assinante.
    const notificationTitle = status === "LIBERADA" ? "Carta liberada criada" : "Nova carta aguardando liberacao";
    const notificationMessage = `${preacher_name} - ${created.preach_date} (${created.preach_period})`;
    try {
      await sb.from("notifications").insert({
        church_totvs_id,
        user_id: signerPastorId,
        type: "letter_created",
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
      });

      await sendInternalPushNotification({
        title: notificationTitle,
        body: notificationMessage,
        url: "/admin",
        user_ids: [signerPastorId],
        totvs_ids: [church_totvs_id],
        data: {
          letter_id: created.id,
          status: created.status,
          preacher_name,
          preacher_user_id,
        },
      });

      if (preacher_user_id) {
        const preacherReleaseTitle = status === "LIBERADA" ? "Carta liberada" : "Carta aguardando liberacao";
        const preacherReleaseMessage = status === "LIBERADA"
          ? `Sua carta para ${created.church_destination} foi liberada.`
          : `Sua carta para ${created.church_destination} foi criada e esta aguardando liberacao.`;
        await insertNotification({
          church_totvs_id,
          user_id: preacher_user_id,
          type: status === "LIBERADA" ? "letter_liberada" : "letter_aguardando_liberacao",
          title: preacherReleaseTitle,
          message: preacherReleaseMessage,
        });
        await sendInternalPushNotification({
          title: preacherReleaseTitle,
          body: preacherReleaseMessage,
          url: "/usuario",
          user_ids: [preacher_user_id],
          totvs_ids: [church_totvs_id],
          data: {
            letter_id: created.id,
            status: created.status,
            preacher_name,
            preacher_user_id,
          },
        });
      }
    } catch {
      // Comentario: notificacao nao pode quebrar criacao da carta.
    }

return json(
  {
    ok: true,
    letter: created,
    n8n: { ok: n8nOk, status: n8nStatus, response: n8nResponse },
    warning: profileWarningDetail
      ? { code: "profile_incomplete_for_letter", detail: profileWarningDetail }
      : null,
  },
  200,
);
}

// ---------------------------------------------------------------------------
// HANDLER: list  (logica original de list-letters/index.ts)
// ---------------------------------------------------------------------------
async function handleList(session: SessionClaims, body: Record<string, unknown>): Promise<Response> {


    const page = Math.max(1, Number(body.page || 1));
    const page_size = Math.min(200, Math.max(1, Number(body.page_size || 50)));
    const from = (page - 1) * page_size;
    const to = from + page_size - 1;

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1) escopo base da sessão
    const { data: allChurches, error: allErr } = await sb
      .from("churches")
      .select("totvs_id,parent_totvs_id");

    if (allErr) return json({ ok: false, error: "db_error_scope", details: allErr.message }, 500);

    const scope = computeScope(session.active_totvs_id, (allChurches || []) as ChurchNode[]);
    let scopeList = [...scope];

    // 2) se front pedir uma igreja específica, valida se está dentro do escopo
    const churchFilter = String(body.church_totvs_id || "").trim();
    if (churchFilter) {
      if (!scope.has(churchFilter) && session.role !== "admin") {
        return json({ ok: false, error: "forbidden_church_out_of_scope" }, 403);
      }
      scopeList = [churchFilter];
    }

    // 3) query principal
    function buildQueryByChurch(scopeIds: string[], includeOptional = true) {
      const fields = includeOptional
        ? "id, church_totvs_id, preacher_user_id, preacher_name, minister_role, preach_date, preach_period, church_origin, church_destination, status, storage_path, url_pronta, url_carta, pdf_url, doc_id, preacher_phone, phone, email, signer_user_id, signer_totvs_id, created_at, updated_at"
        : "id, church_totvs_id, preacher_user_id, preacher_name, minister_role, preach_date, preach_period, church_origin, church_destination, status, storage_path, preacher_phone, phone, email, signer_user_id, signer_totvs_id, created_at, updated_at";

      return sb
        .from("letters")
        .select(fields, { count: "exact" })
        .in("church_totvs_id", scopeIds)
        .neq("status", "EXCLUIDA");
    }

    function buildQueryByPreacher(userId: string, includeOptional = true) {
      const fields = includeOptional
        ? "id, church_totvs_id, preacher_user_id, preacher_name, minister_role, preach_date, preach_period, church_origin, church_destination, status, storage_path, url_pronta, url_carta, pdf_url, doc_id, preacher_phone, phone, email, signer_user_id, signer_totvs_id, created_at, updated_at"
        : "id, church_totvs_id, preacher_user_id, preacher_name, minister_role, preach_date, preach_period, church_origin, church_destination, status, storage_path, preacher_phone, phone, email, signer_user_id, signer_totvs_id, created_at, updated_at";

      return sb
        .from("letters")
        .select(fields, { count: "exact" })
        .eq("preacher_user_id", userId)
        .neq("status", "EXCLUIDA");
    }

    const applyFilters = (q: ReturnType<typeof buildQueryByChurch>) => {
      let query = q;

      const status = String(body.status || "").trim().toUpperCase();
      if (status && status !== "ALL") query = query.eq("status", status);

      const ministerRole = String(body.minister_role || "").trim();
      if (ministerRole && ministerRole.toLowerCase() !== "all") query = query.ilike("minister_role", ministerRole);

      const search = String(body.search || "").trim();
      if (search) {
        const safe = search.replace(/[%,"']/g, "").trim();
        if (safe) {
          query = query.or(`preacher_name.ilike.%${safe}%,church_origin.ilike.%${safe}%,church_destination.ilike.%${safe}%`);
        }
      }

      const quick = String(body.quick || "").trim().toLowerCase();
      if (quick === "today") {
        const ymd = todayYMD();
        query = query.gte("created_at", startOfDayISO(ymd)).lte("created_at", endOfDayISO(ymd));
      } else if (quick === "7d") {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte("created_at", since);
      } else if (quick === "30d") {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte("created_at", since);
      }

      const ds = String(body.date_start || "").trim();
      const de = String(body.date_end || "").trim();
      if (ds) query = query.gte("created_at", startOfDayISO(ds));
      if (de) query = query.lte("created_at", endOfDayISO(de));

      return query;
    };

    let q = applyFilters(buildQueryByChurch(scopeList, true));

    // 4) regra obreiro: só vê as próprias
    if (session.role === "obreiro") {
      q = q.eq("preacher_user_id", session.user_id);
    }

    let result = await q.order("created_at", { ascending: false }).range(from, to);
    if (
      result.error &&
      (
        String(result.error.message || "").toLowerCase().includes("url_pronta") ||
        String(result.error.message || "").toLowerCase().includes("url_carta")
      )
    ) {
      q = applyFilters(buildQueryByChurch(scopeList, false));
      if (session.role === "obreiro") q = q.eq("preacher_user_id", session.user_id);
      result = await q.order("created_at", { ascending: false }).range(from, to);
    }

    const { data, error, count } = result;

    if (error) return json({ ok: false, error: "db_error_list_letters", details: error.message }, 500);

    // 5) Regra pastor: sempre incluir cartas dele (preacher_user_id), mesmo quando origem for igreja acima do escopo.
    if (session.role === "pastor") {
      let mineQuery = applyFilters(buildQueryByPreacher(session.user_id, true));
      if (churchFilter) mineQuery = mineQuery.eq("church_totvs_id", churchFilter);
      let mineResult = await mineQuery.order("created_at", { ascending: false });

      if (
        mineResult.error &&
        (
          String(mineResult.error.message || "").toLowerCase().includes("url_pronta") ||
          String(mineResult.error.message || "").toLowerCase().includes("url_carta")
        )
      ) {
        let mineFallback = applyFilters(buildQueryByPreacher(session.user_id, false));
        if (churchFilter) mineFallback = mineFallback.eq("church_totvs_id", churchFilter);
        mineResult = await mineFallback.order("created_at", { ascending: false });
      }

      if (mineResult.error) {
        return json({ ok: false, error: "db_error_list_letters_mine", details: mineResult.error.message }, 500);
      }

      const merged = new Map<string, Record<string, unknown>>();
      for (const row of (data || []) as Record<string, unknown>[]) merged.set(String(row.id || ""), row);
      for (const row of (mineResult.data || []) as Record<string, unknown>[]) merged.set(String(row.id || ""), row);

      const allRows = [...merged.values()].sort((a, b) =>
        String(b.created_at || "").localeCompare(String(a.created_at || "")),
      );
      const paged = allRows.slice(from, to + 1);
      const enrichedPaged = await enrichLettersWithPreacherChurch(sb, paged as Record<string, unknown>[]);

      return json(
        {
          ok: true,
          letters: enrichedPaged,
          total: allRows.length,
          page,
          page_size,
          scope_totvs_ids: scopeList,
        },
        200,
      );
    }

    const enriched = await enrichLettersWithPreacherChurch(sb, (data || []) as Record<string, unknown>[]);

    return json(
      {
        ok: true,
        letters: enriched || [],
        total: count || 0,
        page,
        page_size,
        scope_totvs_ids: scopeList,
      },
      200,
    );
}

// ---------------------------------------------------------------------------
// HANDLER: get-pdf-url  (logica original de get-letter-pdf-url/index.ts)
// ---------------------------------------------------------------------------
async function handleGetPdfUrl(session: SessionClaims, body: Record<string, unknown>): Promise<Response> {

    const letter_id = String(body.letter_id || "").trim();
    if (!letter_id) return json({ ok: false, error: "missing_letter_id" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let letterQuery = await sb
      .from("letters")
      .select("id, church_totvs_id, preacher_user_id, status, storage_path, url_pronta, url_carta")
      .eq("id", letter_id)
      .maybeSingle();

    if (letterQuery.error && String(letterQuery.error.message || "").toLowerCase().includes("url_carta")) {
      letterQuery = await sb
        .from("letters")
        .select("id, church_totvs_id, preacher_user_id, status, storage_path, url_pronta")
        .eq("id", letter_id)
        .maybeSingle();
    }

    const { data: letter, error: lErr } = letterQuery;
    if (lErr) return json({ ok: false, error: "db_error_letter", details: lErr.message }, 500);
    if (!letter) return json({ ok: false, error: "letter_not_found" }, 404);

    const letterChurch = String((letter as Record<string, unknown>).church_totvs_id || "");
    const preacherUserId = String((letter as Record<string, unknown>).preacher_user_id || "");

    if (session.role === "obreiro") {
      if (!preacherUserId || preacherUserId !== session.user_id) {
        return json({ ok: false, error: "forbidden" }, 403);
      }
    } else {
      const { data: allChurches, error: cErr } = await sb.from("churches").select("totvs_id,parent_totvs_id");
      if (cErr) return json({ ok: false, error: "db_error_scope", details: cErr.message }, 500);
      const scope = computeScope(session.active_totvs_id, (allChurches || []) as ChurchRow[]);
      if (!scope.has(letterChurch) && session.role !== "admin") {
        return json({ ok: false, error: "forbidden" }, 403);
      }
    }

    // Prioriza url_carta quando existir.
    const urlCarta = String((letter as Record<string, unknown>).url_carta || "").trim();
    if (urlCarta.startsWith("http://") || urlCarta.startsWith("https://")) {
      return json({ ok: true, url: urlCarta, source: "url_carta" }, 200);
    }

    const storagePath = normalizeStoragePath((letter as Record<string, unknown>).storage_path);
    const isUrlPronta = Boolean((letter as Record<string, unknown>).url_pronta);
    if (!storagePath) {
      // Comentario: compatibilidade com registros antigos onde o path nao foi salvo.
      // Quando url_pronta=true, tenta caminho padrao por id.
      if (isUrlPronta) {
        const fallbackPath = `documentos/cartas/${letter_id}.pdf`;
        const { data: signedFallback, error: fallbackErr } = await sb.storage
          .from("cartas")
          .createSignedUrl(fallbackPath, 60 * 30);
        if (!fallbackErr && signedFallback?.signedUrl) {
          return json({ ok: true, url: signedFallback.signedUrl, source: "fallback_by_id", path: fallbackPath }, 200);
        }
      }
      return json({ ok: false, error: "pdf_not_ready" }, 409);
    }

    if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
      return json({ ok: true, url: storagePath, source: "storage_path_url" }, 200);
    }

    const pathCandidates = buildPathCandidates(storagePath);
    let lastErr = "";
    for (const candidate of pathCandidates) {
      const { data: signed, error: signErr } = await sb.storage
        .from("cartas")
        .createSignedUrl(candidate, 60 * 30);
      if (!signErr && signed?.signedUrl) {
        return json({ ok: true, url: signed.signedUrl, source: "signed_url", path: candidate }, 200);
      }
      lastErr = String(signErr?.message || "");
    }

    // Fallback publico (quando bucket/objeto esta publico e assinatura falha).
    const publicPath = pathCandidates[0] || storagePath;
    const { data: pub } = sb.storage.from("cartas").getPublicUrl(publicPath);
    if (pub?.publicUrl) {
      return json({ ok: true, url: pub.publicUrl, source: "public_url_fallback", path: publicPath }, 200);
    }

    return json({ ok: false, error: "signed_url_failed", details: lastErr || "no_valid_storage_path", path: storagePath }, 500);
}

// ---------------------------------------------------------------------------
// HANDLER: set-status  (logica original de set-letter-status/index.ts)
// ---------------------------------------------------------------------------
async function handleSetStatus(session: SessionClaims, body: Record<string, unknown>): Promise<Response> {

    const letter_id = String(body.letter_id || "").trim();
    const status = String(body.status || "").trim().toUpperCase();

    if (!letter_id) return json({ ok: false, error: "missing_letter_id" }, 400);
    if (!["LIBERADA", "BLOQUEADO", "EXCLUIDA", "AUTORIZADO", "AGUARDANDO_LIBERACAO", "ENVIADA"].includes(status)) {
      return json({ ok: false, error: "invalid_status" }, 400);
    }

    // Comentario: obreiro so pode excluir suas proprias cartas, nenhuma outra acao
    if (session.role === "obreiro" && status !== "EXCLUIDA") {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: letter, error: lErr } = await sb
      .from("letters")
      .select("id, church_totvs_id, status, preacher_name, preacher_user_id, minister_role, preach_date, preach_period, church_origin, church_destination, preacher_phone, phone, email, signer_user_id, signer_totvs_id, created_at")
      .eq("id", letter_id)
      .maybeSingle();

    if (lErr) return json({ ok: false, error: "db_error_letter", details: lErr.message }, 500);
    if (!letter) return json({ ok: false, error: "letter_not_found" }, 404);

    // Comentario: obreiro so pode excluir carta que ele mesmo criou
    if (session.role === "obreiro" && String(letter.preacher_user_id || "") !== session.user_id) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    // Admin pode tudo. Pastor só no escopo (igreja ativa + filhas).
    if (session.role === "pastor") {
      const { data: allChurches, error: cErr } = await sb
        .from("churches")
        .select("totvs_id,parent_totvs_id");

      if (cErr) return json({ ok: false, error: "db_error_scope", details: cErr.message }, 500);

      const scope = computeScope(session.active_totvs_id, (allChurches || []) as ChurchRow[]);
      if (!scope.has(String(letter.church_totvs_id || ""))) {
        return json({ ok: false, error: "forbidden_wrong_scope" }, 403);
      }
    }

    const prevStatus = String(letter.status || "").toUpperCase();

    if (status === "EXCLUIDA") {
      await sb.from("release_requests").delete().eq("letter_id", letter_id);
      await sb.from("notifications").delete().eq("related_id", letter_id);
      const { error: delErr } = await sb.from("letters").delete().eq("id", letter_id);
      if (delErr) return json({ ok: false, error: "db_error_delete", details: delErr.message }, 500);
      return json({ ok: true, deleted: true, letter_id }, 200);
    }

    const { data: updated, error: uErr } = await sb
      .from("letters")
      .update({ status })
      .eq("id", letter_id)
      .select("id,status,updated_at")
      .single();

    if (uErr) return json({ ok: false, error: "db_error_update", details: uErr.message }, 500);

    // Armazena informações do webhook para retornar na resposta (útil para debug)
    let n8nFired = false;
    let n8nStatus = 0;
    let n8nError: string | null = null;

    // Dispara o webhook apenas quando a carta está sendo liberada pela primeira vez.
    // prevStatus != "LIBERADA" evita disparar duas vezes se o pastor clicar duas vezes.
    if (status === "LIBERADA" && prevStatus !== "LIBERADA") {
      try {
        if (!N8N_WEBHOOK_URL) throw new Error("missing_n8n_letter_webhook_url");
        // Lê os IDs importantes da carta para buscar dados completos
        const churchTotvs = String(letter.church_totvs_id || "");
        const signerTotvs = String(letter.signer_totvs_id || "");
        const signerUserId = String(letter.signer_user_id || "");
        const preacherUserId = String(letter.preacher_user_id || "");
        const churchOrigin = String(letter.church_origin || "");
        const churchDestination = String(letter.church_destination || "");

        // Extrai o número TOTVS da string de destino (ex: "9639 - PEDRA AZUL" → "9639")
        const destinationTotvs = parseTotvsFromText(churchDestination);

        // Busca em paralelo: igrejas de origem/assinante, dados do pastor assinante, dados do pregador
        const [churchesRes, signerRes, preacherRes] = await Promise.all([
          sb.from("churches")
            .select("totvs_id,church_name,stamp_church_url,address_city,address_state")
            .in("totvs_id", [churchTotvs, signerTotvs].filter(Boolean)),

          // Se tem pastor assinante, busca dados dele; senão retorna null
          signerUserId
            ? sb.from("users").select("id,full_name,phone,signature_url,stamp_pastor_url").eq("id", signerUserId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),

          // Se tem pregador, busca data de separação e status de cadastro dele
          preacherUserId
            ? sb.from("users").select("id,ordination_date,baptism_date,totvs_access").eq("id", preacherUserId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        // Separa a lista de igrejas retornadas em: igreja de origem e igreja do assinante
        const churchRows = (churchesRes.data || []) as Record<string, unknown>[];
        const originChurch = churchRows.find((c) => String(c.totvs_id) === churchTotvs) || null;
        const signerChurch = churchRows.find((c) => String(c.totvs_id) === signerTotvs) || null;
        const pastorUser = (signerRes.data as Record<string, unknown> | null) || null;
        const preacherUser = (preacherRes.data as Record<string, unknown> | null) || null;

        // Define status do usuário: AUTORIZADO se aprovado, PENDENTE se pendente
        const preacherDataSeparacao =
          String(preacherUser?.ordination_date || "").trim() ||
          String(preacherUser?.baptism_date || "").trim() ||
          null;
        const preacherRegistrationStatus = resolveRegistrationStatusFromTotvsAccess(
          preacherUser?.totvs_access,
          churchTotvs,
        );
        const statusUsuario = preacherRegistrationStatus === "PENDENTE" ? "PENDENTE" : "AUTORIZADO";

        // Variaveis injetadas do painel Admin para encaminhar a carta ao Pastor Local
        const customStatusCarta = String(body.statusCarta || "");
        // pastorLocalName/Phone podem vir do frontend, mas a Edge Function também resolve
        // automaticamente a partir do default_totvs_id do obreiro quando LIBERADA_PARA_PASTOR
        let resolvedPastorLocalName = String(body.pastorLocalName || "");
        let resolvedPastorLocalPhone = String(body.pastorLocalPhone || "");
        let resolvedPastorLocalEmail = String(body.pastorLocalEmail || "");

        // Se é LIBERADA_PARA_PASTOR mas o frontend não encontrou o pastor (ou enviou vazio),
        // tenta resolver aqui usando service_role: busca default_totvs_id do obreiro → pastor da igreja
        if (customStatusCarta === "LIBERADA_PARA_PASTOR" && !resolvedPastorLocalName && preacherUserId) {
          const { data: preacherForChurch } = await sb
            .from("users")
            .select("default_totvs_id")
            .eq("id", preacherUserId)
            .maybeSingle();
          const preacherLocalTotvs = String((preacherForChurch as Record<string, unknown> | null)?.default_totvs_id || "").trim();
          if (preacherLocalTotvs) {
            // Busca pastor_user_id da igreja do obreiro
            const { data: churchRow } = await sb
              .from("churches")
              .select("pastor_user_id")
              .eq("totvs_id", preacherLocalTotvs)
              .maybeSingle();
            const pastorUserId = String((churchRow as Record<string, unknown> | null)?.pastor_user_id || "").trim();
            if (pastorUserId) {
              const { data: pastorRow } = await sb
                .from("users")
                .select("full_name, phone, email")
                .eq("id", pastorUserId)
                .maybeSingle();
              if (pastorRow) {
                resolvedPastorLocalName = String((pastorRow as Record<string, unknown>).full_name || "");
                resolvedPastorLocalPhone = String((pastorRow as Record<string, unknown>).phone || "");
                resolvedPastorLocalEmail = String((pastorRow as Record<string, unknown>).email || "");
              }
            }
          }
        }

        // Se é SEM_PASTOR, ainda tenta resolver automaticamente (o frontend não encontrou,
        // mas a edge function tem service_role e pode ter acesso a dados que o frontend nao tem)
        if (customStatusCarta === "SEM_PASTOR" && preacherUserId) {
          const { data: preacherForChurch } = await sb
            .from("users")
            .select("default_totvs_id")
            .eq("id", preacherUserId)
            .maybeSingle();
          const preacherLocalTotvs = String((preacherForChurch as Record<string, unknown> | null)?.default_totvs_id || "").trim();
          if (preacherLocalTotvs) {
            const { data: churchRow } = await sb
              .from("churches")
              .select("pastor_user_id")
              .eq("totvs_id", preacherLocalTotvs)
              .maybeSingle();
            const pastorUserId = String((churchRow as Record<string, unknown> | null)?.pastor_user_id || "").trim();
            if (pastorUserId) {
              const { data: pastorRow } = await sb
                .from("users")
                .select("full_name, phone, email")
                .eq("id", pastorUserId)
                .maybeSingle();
              if (pastorRow) {
                resolvedPastorLocalName = String((pastorRow as Record<string, unknown>).full_name || "");
                resolvedPastorLocalPhone = String((pastorRow as Record<string, unknown>).phone || "");
                resolvedPastorLocalEmail = String((pastorRow as Record<string, unknown>).email || "");
              }
            }
          }
        }

        const membroNome = String(letter.preacher_name || "");
        const membroTelefone = String(letter.preacher_phone || letter.phone || "");
        let targetNome = membroNome;
        let targetTelefone = membroTelefone;
        let finalStatusCarta = "LIBERADA";

        if (customStatusCarta === "LIBERADA_PARA_PASTOR" && resolvedPastorLocalName) {
           targetNome = resolvedPastorLocalName;
           targetTelefone = resolvedPastorLocalPhone;
           finalStatusCarta = "LIBERADA_PARA_PASTOR";
        } else if (customStatusCarta === "LIBERADA_PARA_PASTOR" && !resolvedPastorLocalName) {
           // Frontend pediu pra enviar ao pastor mas ninguem encontrou → SEM_PASTOR
           finalStatusCarta = "SEM_PASTOR";
        } else if (customStatusCarta === "SEM_PASTOR" && resolvedPastorLocalName) {
           // Frontend não achou, mas a edge function achou → promove para LIBERADA_PARA_PASTOR
           targetNome = resolvedPastorLocalName;
           targetTelefone = resolvedPastorLocalPhone;
           finalStatusCarta = "LIBERADA_PARA_PASTOR";
        } else if (customStatusCarta === "SEM_PASTOR") {
           finalStatusCarta = "SEM_PASTOR";
        } else if (customStatusCarta === "LIBERADA_PARA_MEMBRO") {
           finalStatusCarta = "LIBERADA_PARA_MEMBRO";
        }

        // URL pública de verificação da carta (para QR Code impresso na carta)
        const appBaseUrl = String(Deno.env.get("APP_BASE_URL") || "https://ipda-letter-creator.vercel.app").replace(/\/$/, "");
        const verifyUrl = `${appBaseUrl}/validar-carta?id=${String(letter.id || "")}`;

        // Monta o payload completo que será enviado ao N8N para gerar o PDF
        const n8nPayload = {
          letter_id: letter.id,
          nome: targetNome,
          // Usa preacher_phone primeiro (telefone do pregador), fallback para phone
          telefone: targetTelefone,
          igreja_origem: churchOrigin,
          origem: churchOrigin,
          igreja_destino: churchDestination,
          dia_pregacao: formatDMY(String(letter.preach_date || "")),
          data_emissao: formatExtended(String(letter.created_at || "")),
          origem_totvs: churchTotvs,
          destino_totvs: destinationTotvs,
          origem_nome: originChurch ? String(originChurch.church_name || "") : churchNameOnly(churchOrigin),
          destino_nome: churchNameOnly(churchDestination),
          email: String(letter.email || ""),
          ministerial: String(letter.minister_role || ""),
          data_separacao: preacherDataSeparacao ? formatDMY(preacherDataSeparacao) : "",
          pastor_responsavel: String(pastorUser?.full_name || ""),
          telefone_pastor: String(pastorUser?.phone || ""),
          assinatura_url: String(pastorUser?.signature_url || ""),
          carimbo_igreja_url: String(signerChurch?.stamp_church_url || ""),
          carimbo_pastor_url: String(pastorUser?.stamp_pastor_url || ""),
          cidade_igreja: String(originChurch?.address_city || ""),
          uf_igreja: String(originChurch?.address_state || ""),
          status_usuario: statusUsuario,
          status_carta: finalStatusCarta,
          // Dados do membro/obreiro (sempre presentes, mesmo quando destinatario e o pastor)
          membro_nome: membroNome,
          membro_telefone: membroTelefone,
          // Dados do pastor local (quando LIBERADA_PARA_PASTOR)
          pastor_local_nome: resolvedPastorLocalName || "",
          pastor_local_telefone: resolvedPastorLocalPhone || "",
          pastor_local_email: resolvedPastorLocalEmail || "",
          client_id: churchTotvs,
          obreiro_id: preacherUserId,
          // URL de verificação pública — usar para gerar QR Code na carta impressa
          verify_url: verifyUrl,
        };

        // Envia o payload para o N8N gerar e enviar o PDF
        const webhookResp = await fetch(N8N_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(n8nPayload),
        });

        n8nFired = true;
        n8nStatus = webhookResp.status;
      } catch (e) {
        // Salva o erro para retornar na resposta (não reverte o status da carta)
        n8nError = String(e);
      }
    }

    const preacherUserId = String(letter.preacher_user_id || "").trim();
    if (preacherUserId) {
      let notificationTitle = "";
      let notificationMessage = "";
      if (status === "LIBERADA") {
        notificationTitle = "Carta liberada";
        notificationMessage = `Sua carta para ${String(letter.church_destination || "").trim() || "pregacao"} foi liberada.`;
      } else if (status === "BLOQUEADO") {
        notificationTitle = "Carta bloqueada";
        notificationMessage = `Sua carta para ${String(letter.church_destination || "").trim() || "pregacao"} foi bloqueada.`;
      } else if (status === "ENVIADA") {
        notificationTitle = "Carta enviada";
        notificationMessage = `A carta para ${String(letter.church_destination || "").trim() || "pregacao"} foi enviada.`;
      }

      if (notificationTitle) {
        try {
          await insertNotification({
            church_totvs_id: String(letter.church_totvs_id || ""),
            user_id: preacherUserId,
            type: `letter_${status.toLowerCase()}`,
            title: notificationTitle,
            message: notificationMessage,
          });
          await sendInternalPushNotification({
            title: notificationTitle,
            body: notificationMessage,
            url: "/usuario",
            user_ids: [preacherUserId],
            totvs_ids: [String(letter.church_totvs_id || "")],
            data: { letter_id, status },
          });
        } catch {
          // Comentario: falha de notificacao nao quebra alteracao de status.
        }
      }
    }

    // Retorna o resultado incluindo informação do webhook para facilitar debug
    return json({ ok: true, letter: updated, n8n: { fired: n8nFired, status: n8nStatus, error: n8nError } }, 200);
}

// ---------------------------------------------------------------------------
// HANDLER: manage  (compatibilidade com telas-cartas)
// ---------------------------------------------------------------------------
async function handleManage(session: SessionClaims, body: Record<string, unknown>): Promise<Response> {
    const letter_id = String(body.letter_id || "").trim();
    const manage_action = String(body.manage_action || "").trim().toLowerCase();
    if (!letter_id) return json({ ok: false, error: "missing_letter_id" }, 400);

    if (manage_action === "release") {
      return await handleSetStatus(session, { letter_id, status: "LIBERADA" });
    }
    if (manage_action === "share") {
      return await handleSetStatus(session, { letter_id, status: "ENVIADA" });
    }
    if (manage_action === "delete") {
      return await handleSetStatus(session, { letter_id, status: "EXCLUIDA" });
    }

    return json({ ok: false, error: "invalid_manage_action", received: manage_action }, 400);
}

// ---------------------------------------------------------------------------
// HANDLER: approve-release  (logica original de approve-release/index.ts)
// ---------------------------------------------------------------------------
async function handleApproveRelease(session: SessionClaims, body: Record<string, unknown>): Promise<Response> {

    if (session.role === "obreiro") return json({ ok: false, error: "forbidden" }, 403);
    const request_id = String(body.request_id || "").trim();
    if (!request_id) return json({ ok: false, error: "missing_request_id" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data: reqRow, error: reqErr } = await sb
      .from("release_requests")
      .select("id, church_totvs_id, letter_id, requester_user_id, status")
      .eq("id", request_id)
      .maybeSingle();

    if (reqErr) return json({ ok: false, error: "db_error_request", details: reqErr.message }, 500);
    if (!reqRow) return json({ ok: false, error: "request_not_found" }, 404);

    if (String(reqRow.church_totvs_id) !== String(session.active_totvs_id)) {
      return json({ ok: false, error: "forbidden_wrong_church" }, 403);
    }
    if (String(reqRow.status) !== "PENDENTE") {
      return json({ ok: false, error: "request_not_pending", status: reqRow.status }, 409);
    }

    const { data: letter, error: letterErr } = await sb
      .from("letters")
      .select("id, church_totvs_id, status, storage_path, preacher_name, preacher_user_id, minister_role, preach_date, preach_period, church_origin, church_destination, phone, email, signer_user_id, signer_totvs_id, created_at")
      .eq("id", reqRow.letter_id)
      .maybeSingle();

    if (letterErr) return json({ ok: false, error: "db_error_letter", details: letterErr.message }, 500);
    if (!letter) return json({ ok: false, error: "letter_not_found" }, 404);

    if (String(letter.church_totvs_id) !== String(session.active_totvs_id)) {
      return json({ ok: false, error: "forbidden_wrong_church_letter" }, 403);
    }

    const { data: reqUpdated, error: updReqErr } = await sb
      .from("release_requests")
      .update({ status: "APROVADO" })
      .eq("id", request_id)
      .select("id, status, updated_at")
      .single();
    if (updReqErr) return json({ ok: false, error: "db_error_update_request", details: updReqErr.message }, 500);

    const { data: letterUpdated, error: updLetterErr } = await sb
      .from("letters")
      .update({ status: "LIBERADA" })
      .eq("id", reqRow.letter_id)
      .select("id, status, updated_at")
      .single();
    if (updLetterErr) return json({ ok: false, error: "db_error_update_letter", details: updLetterErr.message }, 500);

    // Notificacao para o solicitante
    const releaseTitle = "Carta liberada";
    const releaseMessage = `Sua carta de ${letter.preacher_name || "pregacao"} foi liberada.`;
    try {
      await insertNotification({
        church_totvs_id: session.active_totvs_id,
        user_id: String(reqRow.requester_user_id || ""),
        title: releaseTitle,
        message: releaseMessage,
        type: "release_approved",
      });
      await sendInternalPushNotification({
        title: releaseTitle,
        body: releaseMessage,
        url: "/usuario",
        user_ids: [String(reqRow.requester_user_id || "")],
        totvs_ids: [session.active_totvs_id],
        data: { request_id, letter_id: String(reqRow.letter_id || "") },
      });
    } catch {
      // Comentario: falha de notificacao nao impede liberar a carta.
    }

    // Variáveis para registrar o resultado do webhook no response (facilita debug)
    let n8nFired = false;
    let n8nStatus = 0;
    let n8nError: string | null = null;

    // Dispara o webhook N8N para gerar o PDF agora que a carta foi liberada manualmente
    try {
      if (!N8N_WEBHOOK_URL) throw new Error("missing_n8n_letter_webhook_url");
      // Extrai os IDs necessários da carta para buscar dados completos
      const churchTotvs = String(letter.church_totvs_id || "");
      const signerTotvs = String(letter.signer_totvs_id || "");
      const signerUserId = String(letter.signer_user_id || "");
      const preacherUserId = String(letter.preacher_user_id || "");
      const churchOrigin = String(letter.church_origin || "");
      const churchDestination = String(letter.church_destination || "");

      // Extrai o número TOTVS da string de destino (ex: "9639 - PEDRA AZUL" → "9639")
      const destinationTotvs = parseTotvsFromText(churchDestination);

      // Busca em paralelo: igrejas de origem/assinante, dados do pastor, dados do pregador
      const [churchesRes, signerRes, preacherRes] = await Promise.all([
        sb.from("churches")
          .select("totvs_id,church_name,stamp_church_url,address_city,address_state")
          .in("totvs_id", [churchTotvs, signerTotvs].filter(Boolean)),

        // Busca dados do pastor que assina a carta
        signerUserId
          ? sb.from("users").select("id,full_name,phone,signature_url,stamp_pastor_url").eq("id", signerUserId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),

        // Busca data de separação e status de cadastro do pregador
        preacherUserId
          ? sb.from("users").select("id,ordination_date,baptism_date,totvs_access").eq("id", preacherUserId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      // Separa as igrejas retornadas: origem e assinante
      const churchRows = (churchesRes.data || []) as Record<string, unknown>[];
      const originChurch = churchRows.find((c) => String(c.totvs_id) === churchTotvs) || null;
      const signerChurch = churchRows.find((c) => String(c.totvs_id) === signerTotvs) || null;
      const pastorUser = (signerRes.data as Record<string, unknown> | null) || null;
      const preacherUser = (preacherRes.data as Record<string, unknown> | null) || null;

      const preacherDataSeparacao =
        String(preacherUser?.ordination_date || "").trim() ||
        String(preacherUser?.baptism_date || "").trim() ||
        null;
      const preacherRegistrationStatus = resolveRegistrationStatusFromTotvsAccess(
        preacherUser?.totvs_access,
        churchTotvs,
      );

      // Status do usuário para o webhook: PENDENTE se cadastro pendente, AUTORIZADO nos demais casos
      const statusUsuario = preacherRegistrationStatus === "PENDENTE" ? "PENDENTE" : "AUTORIZADO";

      // Monta o payload completo para o N8N gerar o PDF
      const n8nPayload = {
        letter_id: letter.id,
        nome: String(letter.preacher_name || ""),
        telefone: String(letter.phone || ""),
        igreja_origem: churchOrigin,
        origem: churchOrigin,
        igreja_destino: churchDestination,
        dia_pregacao: formatDMY(String(letter.preach_date || "")),
        data_emissao: formatExtended(String(letter.created_at || "")),
        origem_totvs: churchTotvs,
        destino_totvs: destinationTotvs,
        origem_nome: originChurch ? String(originChurch.church_name || "") : churchNameOnly(churchOrigin),
        destino_nome: churchNameOnly(churchDestination),
        email: String(letter.email || ""),
        ministerial: String(letter.minister_role || ""),
        data_separacao: preacherDataSeparacao ? formatDMY(preacherDataSeparacao) : "",
        pastor_responsavel: String(pastorUser?.full_name || ""),
        telefone_pastor: String(pastorUser?.phone || ""),
        assinatura_url: String(pastorUser?.signature_url || ""),
        carimbo_igreja_url: String(signerChurch?.stamp_church_url || ""),
        carimbo_pastor_url: String(pastorUser?.stamp_pastor_url || ""),
        cidade_igreja: String(originChurch?.address_city || ""),
        uf_igreja: String(originChurch?.address_state || ""),
        status_usuario: statusUsuario,
        status_carta: "LIBERADA",
        client_id: churchTotvs,
        obreiro_id: preacherUserId,
      };

      // Envia para o N8N gerar e enviar o PDF ao obreiro
      const webhookResp = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(n8nPayload),
      });

      n8nFired = true;
      n8nStatus = webhookResp.status;
    } catch (e) {
      // Salva o erro mas NÃO reverte a aprovação — a carta continua liberada
      n8nError = String(e);
    }

    // Retorna o resultado incluindo info do webhook para facilitar debug
    return json({ ok: true, request: reqUpdated, letter: letterUpdated, n8n: { fired: n8nFired, status: n8nStatus, error: n8nError } }, 200);
}

// ---------------------------------------------------------------------------
// PONTO DE ENTRADA PRINCIPAL
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  // Responde ao preflight CORS
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    // Verifica o JWT de sessao em todas as actions
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);

    // Le o body para extrair a action e os demais campos
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "").trim().toLowerCase();

    // Roteamento por action
    switch (action) {
      case "create":
        return await handleCreate(session, body);
      case "list":
        return await handleList(session, body);
      case "get-pdf-url":
        return await handleGetPdfUrl(session, body);
      case "set-status":
        return await handleSetStatus(session, body);
      case "manage":
        return await handleManage(session, body);
      case "approve-release":
        return await handleApproveRelease(session, body);
      default:
        return json({ ok: false, error: "unknown_action", received: action }, 400);
    }
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
