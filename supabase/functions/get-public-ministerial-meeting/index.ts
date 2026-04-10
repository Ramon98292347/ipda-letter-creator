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

type Body = { token?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const token = String(body.token || "").trim();
    if (!token) return json({ ok: false, error: "missing_token" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: meeting, error: meetingError } = await sb
      .from("ministerial_meetings")
      .select("id, church_totvs_id, title, meeting_date, public_token, expires_at, is_active, notes, created_at")
      .eq("public_token", token)
      .maybeSingle();

    if (meetingError) return json({ ok: false, error: "db_error_meeting", details: "erro interno" }, 500);
    if (!meeting) return json({ ok: false, error: "meeting_not_found" }, 404);
    if (!meeting.is_active) return json({ ok: false, error: "meeting_inactive" }, 403);
    if (new Date(meeting.expires_at).getTime() < Date.now()) {
      return json({ ok: false, error: "meeting_expired" }, 403);
    }

    const [churchResult, usersResult, attendanceResult] = await Promise.all([
      sb.from("churches").select("totvs_id, church_name, class").eq("totvs_id", meeting.church_totvs_id).maybeSingle(),
      sb.from("users")
        .select("id, full_name, phone, minister_role, default_totvs_id, is_active")
        .eq("default_totvs_id", meeting.church_totvs_id)
        .eq("role", "obreiro")
        .order("full_name", { ascending: true })
        .limit(1000),
      sb.from("ministerial_meeting_attendance")
        .select("user_id, status, justification_text, meeting_date, updated_at")
        .eq("church_totvs_id", meeting.church_totvs_id)
        .eq("meeting_date", meeting.meeting_date),
    ]);

    if (churchResult.error) return json({ ok: false, error: "db_error_church", details: "erro interno" }, 500);
    if (usersResult.error) return json({ ok: false, error: "db_error_users", details: "erro interno" }, 500);
    if (attendanceResult.error) return json({ ok: false, error: "db_error_attendance", details: "erro interno" }, 500);

    const attendanceByUser = new Map<string, Record<string, unknown>>();
    for (const row of attendanceResult.data || []) {
      attendanceByUser.set(String((row as Record<string, unknown>)?.user_id || "").trim(), row as Record<string, unknown>);
    }

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
      .filter((user) => String((user as Record<string, unknown>)?.attendance_status || "SEM_REGISTRO").trim().toUpperCase() === "SEM_REGISTRO");

    return json({
      ok: true,
      meeting: {
        ...meeting,
        church_name: String(churchResult.data?.church_name || ""),
        church_class: String(churchResult.data?.class || ""),
      },
      users,
    });
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
