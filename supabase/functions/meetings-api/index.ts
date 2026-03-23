/**
 * meetings-api
 * ============
 * Função consolidada que substitui 6 edge functions de reuniões ministeriais.
 *
 * Roteamento pelo campo `action` no body:
 *   "create"               → cria uma reunião ministerial (auth obrigatória)
 *   "manage"               → fecha, reabre ou deleta uma reunião (auth obrigatória)
 *   "list"                 → lista reuniões de uma igreja (auth obrigatória)
 *   "save-attendance"      → salva presença via painel admin (auth obrigatória)
 *   "get-public"           → busca dados públicos da reunião por token (sem auth)
 *   "save-public-attendance" → salva presença via link público por token (sem auth)
 *
 * Módulos compartilhados:
 *   import { corsHeaders, json } from "../_shared/cors.ts";
 *   import { verifySessionJWT } from "../_shared/jwt.ts";
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { verifySessionJWT, type SessionClaims } from "../_shared/jwt.ts";

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

type ChurchRow = { totvs_id: string; parent_totvs_id: string | null };
type AttendanceStatus = "PRESENTE" | "FALTA" | "FALTA_JUSTIFICADA";

// ---------------------------------------------------------------------------
// Utilitários compartilhados entre os handlers
// ---------------------------------------------------------------------------

/** Verifica se a string está no formato YYYY-MM-DD */
function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Retorna a data de hoje no fuso de São Paulo (evita bloquear agendamentos no dia) */
function getTodayDateInSaoPaulo() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

/** Gera o expires_at padrão: último segundo do dia da reunião */
function buildDefaultExpiry(meetingDate: string) {
  return `${meetingDate}T23:59:59.000Z`;
}

/** Gera o expires_at padrão ao reabrir: amanhã às 23:59:59 */
function buildDefaultReopenExpiry() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(23, 59, 59, 0);
  return date.toISOString();
}

/** Gera um token público único para a URL da reunião */
function buildPublicToken() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

/**
 * Calcula o conjunto de igrejas filhas (recursivo) a partir de uma raiz.
 * Usado para verificar se o usuário tem permissão sobre a igreja alvo.
 */
function computeScope(rootTotvs: string, churches: ChurchRow[]): Set<string> {
  // Monta mapa de pai → filhos
  const children = new Map<string, string[]>();
  for (const church of churches) {
    const parent = String(church.parent_totvs_id || "");
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(String(church.totvs_id));
  }

  // BFS a partir da raiz
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

/** Normaliza status de presença; retorna string vazia se inválido */
function normalizeStatus(value: string) {
  const safe = String(value || "").trim().toUpperCase();
  return ["PRESENTE", "FALTA", "FALTA_JUSTIFICADA"].includes(safe) ? safe : "";
}

// ---------------------------------------------------------------------------
// Handler: action = "create"
// Cria uma reunião ministerial e gera o token público da lista de presença.
// Equivalente a: create-ministerial-meeting
// ---------------------------------------------------------------------------

async function handleCreate(session: SessionClaims, body: Record<string, unknown>) {
  const churchTotvsId = String(body.church_totvs_id || session.active_totvs_id || "").trim();
  const meetingDate = String(body.meeting_date || "").trim();

  // Validações básicas
  if (!meetingDate || !isDateOnly(meetingDate)) {
    return json({ ok: false, error: "invalid_meeting_date" }, 400);
  }
  if (!churchTotvsId) return json({ ok: false, error: "missing_church_totvs_id" }, 400);

  const expiresAt = String(body.expires_at || buildDefaultExpiry(meetingDate)).trim();
  if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) {
    return json({ ok: false, error: "invalid_expires_at" }, 400);
  }

  // Não permite criar reuniões no passado (usando fuso de São Paulo)
  const todayDate = getTodayDateInSaoPaulo();
  if (meetingDate < todayDate) {
    return json({ ok: false, error: "meeting_date_in_past" }, 400);
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Verifica escopo da igreja (não-admin só pode criar em igrejas filhas)
  if (session.role !== "admin" && churchTotvsId !== session.active_totvs_id) {
    const { data: allChurches, error: churchesErr } = await sb.from("churches").select("totvs_id, parent_totvs_id");
    if (churchesErr) return json({ ok: false, error: "db_error_churches" }, 500);
    const scope = computeScope(session.active_totvs_id, (allChurches || []) as ChurchRow[]);
    if (!scope.has(churchTotvsId)) return json({ ok: false, error: "church_out_of_scope" }, 403);
  }

  // Busca dados da igreja para incluir no retorno
  const { data: church, error: churchError } = await sb
    .from("churches")
    .select("totvs_id, church_name")
    .eq("totvs_id", churchTotvsId)
    .maybeSingle();

  if (churchError) return json({ ok: false, error: "db_error_church" }, 500);
  if (!church) return json({ ok: false, error: "church_not_found" }, 404);

  const publicToken = buildPublicToken();

  // Insere a reunião no banco
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

  if (createError) return json({ ok: false, error: "db_error_create_meeting" }, 500);

  return json({
    ok: true,
    meeting: {
      ...created,
      church_name: String(church.church_name || ""),
    },
  });
}

// ---------------------------------------------------------------------------
// Handler: action = "manage"
// Fecha, reabre ou deleta uma reunião ministerial.
// Equivalente a: manage-ministerial-meeting
// ---------------------------------------------------------------------------

async function handleManage(session: SessionClaims, body: Record<string, unknown>) {
  const meetingId = String(body.meeting_id || "").trim();
  // "action" aqui é a sub-ação (close/reopen/delete), diferente do campo de roteamento
  const manageAction = String(body.manage_action || "").trim().toLowerCase();
  const churchTotvsId = String(body.church_totvs_id || session.active_totvs_id || "").trim();

  if (!meetingId) return json({ ok: false, error: "missing_meeting_id" }, 400);
  if (!["close", "reopen", "delete"].includes(manageAction)) {
    return json({ ok: false, error: "invalid_manage_action" }, 400);
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Verifica escopo da igreja
  if (session.role !== "admin" && churchTotvsId !== session.active_totvs_id) {
    const { data: allChurches, error: churchesErr } = await sb.from("churches").select("totvs_id, parent_totvs_id");
    if (churchesErr) return json({ ok: false, error: "db_error_churches" }, 500);
    const scope = computeScope(session.active_totvs_id, (allChurches || []) as ChurchRow[]);
    if (!scope.has(churchTotvsId)) return json({ ok: false, error: "church_out_of_scope" }, 403);
  }

  // Busca a reunião para confirmar que existe e pertence à igreja
  const { data: meeting, error: meetingError } = await sb
    .from("ministerial_meetings")
    .select("id, church_totvs_id, meeting_date, is_active, expires_at")
    .eq("id", meetingId)
    .eq("church_totvs_id", churchTotvsId)
    .maybeSingle();

  if (meetingError) return json({ ok: false, error: "db_error_meeting" }, 500);
  if (!meeting) return json({ ok: false, error: "meeting_not_found" }, 404);

  // Deleção: remove presenças e depois a reunião
  if (manageAction === "delete") {
    const { error: deleteAttendanceError } = await sb
      .from("ministerial_meeting_attendance")
      .delete()
      .eq("church_totvs_id", meeting.church_totvs_id)
      .eq("meeting_date", meeting.meeting_date);

    if (deleteAttendanceError) {
      return json({ ok: false, error: "db_error_delete_attendance" }, 500);
    }

    const { error: deleteMeetingError } = await sb.from("ministerial_meetings").delete().eq("id", meetingId);
    if (deleteMeetingError) {
      return json({ ok: false, error: "db_error_delete_meeting" }, 500);
    }

    return json({ ok: true, deleted: true, meeting_id: meetingId });
  }

  // Fechar ou reabrir: monta patch com os campos a atualizar
  const patch =
    manageAction === "close"
      ? { is_active: false }
      : {
          is_active: true,
          expires_at: String(body.expires_at || buildDefaultReopenExpiry()),
        };

  if (manageAction === "reopen" && Number.isNaN(Date.parse(String(patch.expires_at || "")))) {
    return json({ ok: false, error: "invalid_expires_at" }, 400);
  }

  const { data: updated, error: updateError } = await sb
    .from("ministerial_meetings")
    .update(patch)
    .eq("id", meetingId)
    .select("id, church_totvs_id, title, meeting_date, public_token, expires_at, is_active, notes, created_at")
    .single();

  if (updateError) return json({ ok: false, error: "db_error_update_meeting" }, 500);

  return json({ ok: true, meeting: updated });
}

// ---------------------------------------------------------------------------
// Handler: action = "list"
// Lista as últimas 10 reuniões ministeriais de uma igreja.
// Equivalente a: list-ministerial-meetings
// ---------------------------------------------------------------------------

async function handleList(session: SessionClaims, body: Record<string, unknown>) {
  const churchTotvsId = String(body.church_totvs_id || session.active_totvs_id || "").trim();

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Verifica escopo da igreja
  if (session.role !== "admin" && churchTotvsId !== session.active_totvs_id) {
    const { data: allChurches, error: churchesErr } = await sb.from("churches").select("totvs_id, parent_totvs_id");
    if (churchesErr) return json({ ok: false, error: "db_error_churches" }, 500);
    const scope = computeScope(session.active_totvs_id, (allChurches || []) as ChurchRow[]);
    if (!scope.has(churchTotvsId)) return json({ ok: false, error: "church_out_of_scope" }, 403);
  }

  const { data, error } = await sb
    .from("ministerial_meetings")
    .select("id, church_totvs_id, title, meeting_date, public_token, expires_at, is_active, notes, created_at")
    .eq("church_totvs_id", churchTotvsId)
    .order("meeting_date", { ascending: false })
    .limit(10);

  if (error) return json({ ok: false, error: "db_error_meetings" }, 500);

  return json({ ok: true, meetings: data || [] });
}

// ---------------------------------------------------------------------------
// Handler: action = "save-attendance"
// Salva presença de um obreiro via painel admin (requer JWT).
// Equivalente a: save-ministerial-attendance
// ---------------------------------------------------------------------------

async function handleSaveAttendance(session: SessionClaims, body: Record<string, unknown>) {
  // Apenas admin, pastor e secretario podem marcar presença
  if (!["admin", "pastor", "secretario"].includes(session.role)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const userId = String(body.user_id || "").trim();
  const meetingDate = String(body.meeting_date || "").trim();
  const churchTotvsId = String(body.church_totvs_id || session.active_totvs_id || "").trim();
  const status = String(body.status || "").trim().toUpperCase() as AttendanceStatus;
  const justificationText = String(body.justification_text || "").trim() || null;

  if (!userId) return json({ ok: false, error: "missing_user_id" }, 400);
  if (!churchTotvsId) return json({ ok: false, error: "missing_church_totvs_id" }, 400);
  if (!isDateOnly(meetingDate)) return json({ ok: false, error: "invalid_meeting_date" }, 400);
  if (!["PRESENTE", "FALTA", "FALTA_JUSTIFICADA"].includes(status)) {
    return json({ ok: false, error: "invalid_status" }, 400);
  }
  if (status === "FALTA_JUSTIFICADA" && !justificationText) {
    return json({ ok: false, error: "missing_justification" }, 400);
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );

  // Verifica escopo (admin pode tudo; os demais só em igrejas filhas)
  const { data: allChurches, error: churchesErr } = await sb
    .from("churches")
    .select("totvs_id, parent_totvs_id");
  if (churchesErr) return json({ ok: false, error: "db_error_churches" }, 500);

  if (session.role !== "admin") {
    const scope = computeScope(session.active_totvs_id, (allChurches || []) as ChurchRow[]);
    if (!scope.has(churchTotvsId)) {
      return json({ ok: false, error: "church_out_of_scope" }, 403);
    }
  }

  // Valida se o usuário alvo existe e está na igreja correta
  const { data: targetUser, error: targetErr } = await sb
    .from("users")
    .select("id, full_name, role, default_totvs_id, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (targetErr) return json({ ok: false, error: "db_error_target_user" }, 500);
  if (!targetUser) return json({ ok: false, error: "user_not_found" }, 404);

  if (String(targetUser.default_totvs_id || "") !== churchTotvsId) {
    return json({ ok: false, error: "user_not_in_selected_church" }, 409);
  }

  // Salva ou atualiza o registro de presença (upsert por user_id + meeting_date)
  const { data: attendance, error: attendanceErr } = await sb
    .from("ministerial_meeting_attendance")
    .upsert(
      {
        user_id: userId,
        meeting_date: meetingDate,
        church_totvs_id: churchTotvsId,
        status,
        justification_text: status === "FALTA_JUSTIFICADA" ? justificationText : null,
        marked_by: session.user_id,
        blocked_on_save: false,
      },
      { onConflict: "user_id,meeting_date" },
    )
    .select("id, user_id, meeting_date, church_totvs_id, status, justification_text, created_at, updated_at")
    .single();
  if (attendanceErr) return json({ ok: false, error: "db_error_save_attendance" }, 500);

  // Conta faltas sem justificativa nos últimos 180 dias
  const cutoffDate = new Date();
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 180);
  const cutoffIso = cutoffDate.toISOString().slice(0, 10);

  const { count: absencesCount, error: countErr } = await sb
    .from("ministerial_meeting_attendance")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "FALTA")
    .gte("meeting_date", cutoffIso);
  if (countErr) return json({ ok: false, error: "db_error_count_absences" }, 500);

  // Bloqueia automaticamente se atingir 3 faltas
  let blockedOnSave = false;
  if ((absencesCount || 0) >= 3) {
    blockedOnSave = true;
    const nowIso = new Date().toISOString();

    const { error: blockErr } = await sb
      .from("users")
      .update({
        is_active: false,
        discipline_status: "BLOQUEADO_DISCIPLINA",
        discipline_block_reason: "3 faltas sem justificativa em 180 dias",
        discipline_blocked_at: nowIso,
        discipline_updated_by: session.user_id,
      })
      .eq("id", userId);
    if (blockErr) return json({ ok: false, error: "db_error_block_user" }, 500);

    // Marca o registro de presença como gerador do bloqueio
    await sb
      .from("ministerial_meeting_attendance")
      .update({ blocked_on_save: true })
      .eq("id", attendance.id);
  }

  return json({
    ok: true,
    attendance,
    absences_without_justification_180_days: absencesCount || 0,
    blocked_on_save: blockedOnSave,
    user: {
      id: targetUser.id,
      full_name: targetUser.full_name,
      role: targetUser.role,
      default_totvs_id: targetUser.default_totvs_id,
    },
  });
}

// ---------------------------------------------------------------------------
// Handler: action = "get-public"
// Busca dados públicos da reunião via token (sem autenticação).
// Equivalente a: get-public-ministerial-meeting
// ---------------------------------------------------------------------------

async function handleGetPublic(body: Record<string, unknown>) {
  const token = String(body.token || "").trim();
  if (!token) return json({ ok: false, error: "missing_token" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Busca a reunião pelo token público
  const { data: meeting, error: meetingError } = await sb
    .from("ministerial_meetings")
    .select("id, church_totvs_id, title, meeting_date, public_token, expires_at, is_active, notes, created_at")
    .eq("public_token", token)
    .maybeSingle();

  if (meetingError) return json({ ok: false, error: "db_error_meeting" }, 500);
  if (!meeting) return json({ ok: false, error: "meeting_not_found" }, 404);
  if (!meeting.is_active) return json({ ok: false, error: "meeting_inactive" }, 403);
  if (new Date(meeting.expires_at).getTime() < Date.now()) {
    return json({ ok: false, error: "meeting_expired" }, 403);
  }

  // Busca dados da igreja, lista de obreiros e presenças já registradas em paralelo
  const [churchResult, usersResult, attendanceResult] = await Promise.all([
    sb.from("churches").select("totvs_id, church_name, class").eq("totvs_id", meeting.church_totvs_id).maybeSingle(),
    sb
      .from("users")
      .select("id, full_name, phone, minister_role, default_totvs_id, is_active")
      .eq("default_totvs_id", meeting.church_totvs_id)
      .eq("role", "obreiro")
      .order("full_name", { ascending: true })
      .limit(1000),
    sb
      .from("ministerial_meeting_attendance")
      .select("user_id, status, justification_text, meeting_date, updated_at")
      .eq("church_totvs_id", meeting.church_totvs_id)
      .eq("meeting_date", meeting.meeting_date),
  ]);

  if (churchResult.error) return json({ ok: false, error: "db_error_church" }, 500);
  if (usersResult.error) return json({ ok: false, error: "db_error_users" }, 500);
  if (attendanceResult.error) return json({ ok: false, error: "db_error_attendance" }, 500);

  // Mapa rápido de userId → registro de presença
  const attendanceByUser = new Map<string, Record<string, unknown>>();
  for (const row of attendanceResult.data || []) {
    attendanceByUser.set(String((row as Record<string, unknown>)?.user_id || "").trim(), row as Record<string, unknown>);
  }

  // Retorna apenas obreiros que ainda NÃO registraram presença (SEM_REGISTRO)
  const users = (usersResult.data || [])
    .map((user) => {
      const attendance = attendanceByUser.get(String((user as Record<string, unknown>)?.id || "").trim());
      return {
        ...user,
        attendance_status: String(attendance?.status || "SEM_REGISTRO").trim().toUpperCase(),
        justification_text: String(attendance?.justification_text || "").trim(),
        attendance_updated_at: String(attendance?.updated_at || "").trim() || null,
      };
    })
    .filter(
      (user) =>
        String((user as Record<string, unknown>)?.attendance_status || "SEM_REGISTRO")
          .trim()
          .toUpperCase() === "SEM_REGISTRO",
    );

  return json({
    ok: true,
    meeting: {
      ...meeting,
      church_name: String(churchResult.data?.church_name || ""),
      church_class: String(churchResult.data?.class || ""),
    },
    users,
  });
}

// ---------------------------------------------------------------------------
// Handler: action = "save-public-attendance"
// Salva presença via link público com token (sem autenticação).
// Equivalente a: save-public-ministerial-attendance
// ---------------------------------------------------------------------------

async function handleSavePublicAttendance(body: Record<string, unknown>) {
  const token = String(body.token || "").trim();
  const userId = String(body.user_id || "").trim();
  const status = normalizeStatus(String(body.status || ""));
  const justification = String(body.justification_text || "").trim();

  if (!token) return json({ ok: false, error: "missing_token" }, 400);
  if (!userId) return json({ ok: false, error: "missing_user_id" }, 400);
  if (!status) return json({ ok: false, error: "invalid_status" }, 400);
  if (status === "FALTA_JUSTIFICADA" && !justification) {
    return json({ ok: false, error: "missing_justification" }, 400);
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Valida token e estado da reunião
  const { data: meeting, error: meetingError } = await sb
    .from("ministerial_meetings")
    .select("id, church_totvs_id, meeting_date, expires_at, is_active")
    .eq("public_token", token)
    .maybeSingle();

  if (meetingError) return json({ ok: false, error: "db_error_meeting" }, 500);
  if (!meeting) return json({ ok: false, error: "meeting_not_found" }, 404);
  if (!meeting.is_active) return json({ ok: false, error: "meeting_inactive" }, 403);
  if (new Date(meeting.expires_at).getTime() < Date.now()) {
    return json({ ok: false, error: "meeting_expired" }, 403);
  }

  // Confirma que o usuário é obreiro e pertence à igreja da reunião
  const { data: user, error: userError } = await sb
    .from("users")
    .select("id, default_totvs_id")
    .eq("id", userId)
    .eq("role", "obreiro")
    .maybeSingle();

  if (userError) return json({ ok: false, error: "db_error_user" }, 500);
  if (!user) return json({ ok: false, error: "user_not_found" }, 404);
  if (String(user.default_totvs_id || "") !== String(meeting.church_totvs_id || "")) {
    return json({ ok: false, error: "user_not_in_selected_church" }, 403);
  }

  // Salva ou atualiza a presença
  const { error: saveError } = await sb
    .from("ministerial_meeting_attendance")
    .upsert(
      {
        church_totvs_id: meeting.church_totvs_id,
        user_id: userId,
        meeting_date: meeting.meeting_date,
        status,
        justification_text: status === "FALTA_JUSTIFICADA" ? justification : null,
        blocked_on_save: false,
        marked_by: null,
      },
      { onConflict: "user_id,meeting_date" },
    );

  if (saveError) return json({ ok: false, error: "db_error_save_attendance" }, 500);

  // Conta faltas nos últimos 180 dias para verificar bloqueio
  const cutoffDate = new Date();
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 180);
  const cutoffIso = cutoffDate.toISOString().slice(0, 10);

  const { data: absences, error: absencesError } = await sb
    .from("ministerial_meeting_attendance")
    .select("id", { count: "exact" })
    .eq("user_id", userId)
    .eq("status", "FALTA")
    .gte("meeting_date", cutoffIso);

  if (absencesError) return json({ ok: false, error: "db_error_absences" }, 500);

  const absenceCount = Array.isArray(absences) ? absences.length : 0;
  let blocked = false;

  // Bloqueia automaticamente se atingir 3 faltas
  if (absenceCount >= 3) {
    blocked = true;
    const { error: blockError } = await sb
      .from("users")
      .update({
        is_active: false,
        discipline_status: "BLOQUEADO_DISCIPLINA",
        discipline_block_reason: "3 faltas sem justificativa em 180 dias",
        discipline_blocked_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (blockError) return json({ ok: false, error: "db_error_block_user" }, 500);

    // Marca o registro de presença como gerador do bloqueio
    await sb
      .from("ministerial_meeting_attendance")
      .update({ blocked_on_save: true })
      .eq("user_id", userId)
      .eq("meeting_date", meeting.meeting_date);
  }

  return json({
    ok: true,
    saved: true,
    blocked,
    absence_count_180_days: absenceCount,
  });
}

// ---------------------------------------------------------------------------
// Entry point principal — roteamento por `action`
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  // Responde preflight CORS
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    // Lê o body uma única vez
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "").trim().toLowerCase();

    if (!action) return json({ ok: false, error: "missing_action" }, 400);

    // Actions públicas: não exigem JWT
    if (action === "get-public") {
      return await handleGetPublic(body);
    }
    if (action === "save-public-attendance") {
      return await handleSavePublicAttendance(body);
    }

    // Actions autenticadas: verificar JWT antes de prosseguir
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);

    // Roteamento para os handlers autenticados
    if (action === "create") return await handleCreate(session, body);
    if (action === "manage") return await handleManage(session, body);
    if (action === "list") return await handleList(session, body);
    if (action === "save-attendance") return await handleSaveAttendance(session, body);

    // Action desconhecida
    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (err) {
    return json({ ok: false, error: "exception" }, 500);
  }
});
