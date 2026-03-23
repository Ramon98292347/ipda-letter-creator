/**
 * create-ministerial-meeting
 * ==========================
 * O que faz: Cria uma reunião ministerial e gera o token público da lista de presença.
 * Para que serve: Usada na aba Presença para agendar uma reunião e liberar a URL pública.
 * Quem pode usar: admin, pastor e secretario autenticados com o JWT do sistema.
 * Recebe: { church_totvs_id?, title?, meeting_date, expires_at?, notes? }
 * Retorna: { ok, meeting }
 * Observações: A data da reunião é validada usando o fuso de São Paulo para não bloquear
 *              agendamentos do mesmo dia no horário local do Brasil.
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

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders() });
}

type Role = "admin" | "pastor" | "obreiro" | "secretario" | "financeiro";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };
type Body = { church_totvs_id?: string; title?: string; meeting_date?: string; expires_at?: string; notes?: string };
type ChurchRow = { totvs_id: string; parent_totvs_id: string | null };

async function verifySessionJWT(req: Request): Promise<SessionClaims | null> {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  const secret = Deno.env.get("USER_SESSION_JWT_SECRET") || "";
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    const user_id = String(payload.sub || "");
    const role = String(payload.role || "").toLowerCase() as Role;
    const active_totvs_id = String(payload.active_totvs_id || "");
    if (!user_id || !active_totvs_id) return null;
    if (!["admin", "pastor", "secretario"].includes(role)) return null;
    return { user_id, role, active_totvs_id };
  } catch {
    return null;
  }
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getTodayDateInSaoPaulo() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function buildDefaultExpiry(meetingDate: string) {
  return `${meetingDate}T23:59:59.000Z`;
}

function buildPublicToken() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function computeScope(rootTotvs: string, churches: ChurchRow[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const church of churches) {
    const parent = String(church.parent_totvs_id || "");
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(String(church.totvs_id));
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;
    const churchTotvsId = String(body.church_totvs_id || session.active_totvs_id || "").trim();
    const meetingDate = String(body.meeting_date || "").trim();
    if (!meetingDate || !isDateOnly(meetingDate)) {
      return json({ ok: false, error: "invalid_meeting_date" }, 400);
    }
    if (!churchTotvsId) return json({ ok: false, error: "missing_church_totvs_id" }, 400);

    const expiresAt = String(body.expires_at || buildDefaultExpiry(meetingDate)).trim();
    if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) {
      return json({ ok: false, error: "invalid_expires_at" }, 400);
    }

    const todayDate = getTodayDateInSaoPaulo();
    if (meetingDate < todayDate) {
      return json({ ok: false, error: "meeting_date_in_past" }, 400);
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (session.role !== "admin" && churchTotvsId !== session.active_totvs_id) {
      const { data: allChurches, error: churchesErr } = await sb.from("churches").select("totvs_id, parent_totvs_id");
      if (churchesErr) return json({ ok: false, error: "db_error_churches", details: churchesErr.message }, 500);
      const scope = computeScope(session.active_totvs_id, (allChurches || []) as ChurchRow[]);
      if (!scope.has(churchTotvsId)) return json({ ok: false, error: "church_out_of_scope" }, 403);
    }

    const { data: church, error: churchError } = await sb
      .from("churches")
      .select("totvs_id, church_name")
      .eq("totvs_id", churchTotvsId)
      .maybeSingle();

    if (churchError) return json({ ok: false, error: "db_error_church", details: churchError.message }, 500);
    if (!church) return json({ ok: false, error: "church_not_found" }, 404);

    const publicToken = buildPublicToken();

    const { data: created, error: createError } = await sb
      .from("ministerial_meetings")
      .insert({
        church_totvs_id: churchTotvsId,
        title: String(body.title || "").trim() || null,
        meeting_date: meetingDate,
        public_token: publicToken,
        expires_at: expiresAt,
        notes: String(body.notes || "").trim() || null,
        created_by: session.user_id,
        is_active: true,
      })
      .select("id, church_totvs_id, title, meeting_date, public_token, expires_at, is_active, notes, created_at")
      .single();

    if (createError) return json({ ok: false, error: "db_error_create_meeting", details: createError.message }, 500);

    return json({
      ok: true,
      meeting: {
        ...created,
        church_name: String(church.church_name || ""),
      },
    });
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
