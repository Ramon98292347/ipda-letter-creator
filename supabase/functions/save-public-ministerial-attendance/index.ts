/**
 * save-public-ministerial-attendance
 * =================================
 * O que faz: Salva a presença pública de um obreiro em uma reunião ministerial via token.
 * Para que serve: Usada na URL pública da reunião para registrar Presente, Falta ou Falta justificada.
 * Quem pode usar: acesso público com token válido da reunião.
 * Recebe: { token, user_id, status, justification_text? }
 * Retorna: { ok, saved, blocked, absence_count_180_days }
 * Observações: Ao atingir 3 faltas sem justificativa em 180 dias, o obreiro é bloqueado automaticamente.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

type Body = {
  token?: string;
  user_id?: string;
  status?: string;
  justification_text?: string | null;
};

function normalizeStatus(value: string) {
  const safe = String(value || "").trim().toUpperCase();
  return ["PRESENTE", "FALTA", "FALTA_JUSTIFICADA"].includes(safe) ? safe : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
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

    const { data: meeting, error: meetingError } = await sb
      .from("ministerial_meetings")
      .select("id, church_totvs_id, meeting_date, expires_at, is_active")
      .eq("public_token", token)
      .maybeSingle();

    if (meetingError) return json({ ok: false, error: "db_error_meeting", details: "erro interno" }, 500);
    if (!meeting) return json({ ok: false, error: "meeting_not_found" }, 404);
    if (!meeting.is_active) return json({ ok: false, error: "meeting_inactive" }, 403);
    if (new Date(meeting.expires_at).getTime() < Date.now()) {
      return json({ ok: false, error: "meeting_expired" }, 403);
    }

    const { data: user, error: userError } = await sb
      .from("users")
      .select("id, default_totvs_id")
      .eq("id", userId)
      .eq("role", "obreiro")
      .maybeSingle();

    if (userError) return json({ ok: false, error: "db_error_user", details: "erro interno" }, 500);
    if (!user) return json({ ok: false, error: "user_not_found" }, 404);
    if (String(user.default_totvs_id || "") !== String(meeting.church_totvs_id || "")) {
      return json({ ok: false, error: "user_not_in_selected_church" }, 403);
    }

    const { error: saveError } = await sb
      .from("ministerial_meeting_attendance")
      .upsert({
        church_totvs_id: meeting.church_totvs_id,
        user_id: userId,
        meeting_date: meeting.meeting_date,
        status,
        justification_text: status === "FALTA_JUSTIFICADA" ? justification : null,
        blocked_on_save: false,
        marked_by: null,
      }, { onConflict: "user_id,meeting_date" });

    if (saveError) return json({ ok: false, error: "db_error_save_attendance", details: "erro interno" }, 500);

    const cutoffDate = new Date();
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 180);
    const cutoffIso = cutoffDate.toISOString().slice(0, 10);

    const { data: absences, error: absencesError } = await sb
      .from("ministerial_meeting_attendance")
      .select("id", { count: "exact" })
      .eq("user_id", userId)
      .eq("status", "FALTA")
      .gte("meeting_date", cutoffIso);

    if (absencesError) return json({ ok: false, error: "db_error_absences", details: "erro interno" }, 500);

    const absenceCount = Array.isArray(absences) ? absences.length : 0;
    let blocked = false;

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

      if (blockError) return json({ ok: false, error: "db_error_block_user", details: "erro interno" }, 500);

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
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
