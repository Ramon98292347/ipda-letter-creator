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
type AttendanceStatus = "PRESENTE" | "FALTA" | "FALTA_JUSTIFICADA";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };
type Body = {
  user_id?: string;
  meeting_date?: string;
  church_totvs_id?: string;
  status?: AttendanceStatus;
  justification_text?: string | null;
};
type ChurchRow = { totvs_id: string; parent_totvs_id: string | null };

async function verifySessionJWT(req: Request): Promise<SessionClaims | null> {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  const secret = Deno.env.get("USER_SESSION_JWT_SECRET") || "";
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
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

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);
    if (!["admin", "pastor", "secretario"].includes(session.role)) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const userId = String(body.user_id || "").trim();
    const meetingDate = String(body.meeting_date || "").trim();
    const churchTotvsId = String(body.church_totvs_id || session.active_totvs_id || "").trim();
    const status = String(body.status || "").trim().toUpperCase() as AttendanceStatus;
    const justificationText = String(body.justification_text || "").trim() || null;

    if (!userId) return json({ ok: false, error: "missing_user_id" }, 400);
    if (!churchTotvsId) return json({ ok: false, error: "missing_church_totvs_id" }, 400);
    if (!isValidDate(meetingDate)) return json({ ok: false, error: "invalid_meeting_date" }, 400);
    if (!["PRESENTE", "FALTA", "FALTA_JUSTIFICADA"].includes(status)) {
      return json({ ok: false, error: "invalid_status" }, 400);
    }
    if (status === "FALTA_JUSTIFICADA" && !justificationText) {
      return json({ ok: false, error: "missing_justification" }, 400);
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

    const { data: allChurches, error: churchesErr } = await sb
      .from("churches")
      .select("totvs_id, parent_totvs_id");
    if (churchesErr) return json({ ok: false, error: "db_error_churches", details: churchesErr.message }, 500);

    if (session.role !== "admin") {
      const scope = computeScope(session.active_totvs_id, (allChurches || []) as ChurchRow[]);
      if (!scope.has(churchTotvsId)) {
        return json({ ok: false, error: "church_out_of_scope" }, 403);
      }
    }

    const { data: targetUser, error: targetErr } = await sb
      .from("users")
      .select("id, full_name, role, default_totvs_id, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (targetErr) return json({ ok: false, error: "db_error_target_user", details: targetErr.message }, 500);
    if (!targetUser) return json({ ok: false, error: "user_not_found" }, 404);

    if (String(targetUser.default_totvs_id || "") !== churchTotvsId) {
      return json({ ok: false, error: "user_not_in_selected_church" }, 409);
    }

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
    if (attendanceErr) return json({ ok: false, error: "db_error_save_attendance", details: attendanceErr.message }, 500);

    const cutoffDate = new Date();
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 180);
    const cutoffIso = cutoffDate.toISOString().slice(0, 10);

    const { count: absencesCount, error: countErr } = await sb
      .from("ministerial_meeting_attendance")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "FALTA")
      .gte("meeting_date", cutoffIso);
    if (countErr) return json({ ok: false, error: "db_error_count_absences", details: countErr.message }, 500);

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
      if (blockErr) return json({ ok: false, error: "db_error_block_user", details: blockErr.message }, 500);

      await sb
        .from("ministerial_meeting_attendance")
        .update({ blocked_on_save: true })
        .eq("id", attendance.id);
    }

    return json(
      {
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
      },
      200,
    );
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
