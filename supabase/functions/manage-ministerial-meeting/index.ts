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
type Body = { meeting_id?: string; action?: "close" | "reopen" | "delete"; church_totvs_id?: string; expires_at?: string };
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

function buildDefaultReopenExpiry() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(23, 59, 59, 0);
  return date.toISOString();
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
    const meetingId = String(body.meeting_id || "").trim();
    const action = String(body.action || "").trim().toLowerCase();
    const churchTotvsId = String(body.church_totvs_id || session.active_totvs_id || "").trim();

    if (!meetingId) return json({ ok: false, error: "missing_meeting_id" }, 400);
    if (!["close", "reopen", "delete"].includes(action)) return json({ ok: false, error: "invalid_action" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (session.role !== "admin" && churchTotvsId !== session.active_totvs_id) {
      const { data: allChurches, error: churchesErr } = await sb.from("churches").select("totvs_id, parent_totvs_id");
      if (churchesErr) return json({ ok: false, error: "db_error_churches", details: "erro interno" }, 500);
      const scope = computeScope(session.active_totvs_id, (allChurches || []) as ChurchRow[]);
      if (!scope.has(churchTotvsId)) return json({ ok: false, error: "church_out_of_scope" }, 403);
    }

    const { data: meeting, error: meetingError } = await sb
      .from("ministerial_meetings")
      .select("id, church_totvs_id, meeting_date, is_active, expires_at")
      .eq("id", meetingId)
      .eq("church_totvs_id", churchTotvsId)
      .maybeSingle();

    if (meetingError) return json({ ok: false, error: "db_error_meeting", details: "erro interno" }, 500);
    if (!meeting) return json({ ok: false, error: "meeting_not_found" }, 404);

    if (action === "delete") {
      const { error: deleteAttendanceError } = await sb
        .from("ministerial_meeting_attendance")
        .delete()
        .eq("church_totvs_id", meeting.church_totvs_id)
        .eq("meeting_date", meeting.meeting_date);

      if (deleteAttendanceError) {
        return json({ ok: false, error: "db_error_delete_attendance", details: "erro interno" }, 500);
      }

      const { error: deleteMeetingError } = await sb.from("ministerial_meetings").delete().eq("id", meetingId);
      if (deleteMeetingError) {
        return json({ ok: false, error: "db_error_delete_meeting", details: "erro interno" }, 500);
      }

      return json({ ok: true, deleted: true, meeting_id: meetingId });
    }

    const patch =
      action === "close"
        ? { is_active: false }
        : {
            is_active: true,
            expires_at: String(body.expires_at || buildDefaultReopenExpiry()),
          };

    if (action === "reopen" && Number.isNaN(Date.parse(String(patch.expires_at || "")))) {
      return json({ ok: false, error: "invalid_expires_at" }, 400);
    }

    const { data: updated, error: updateError } = await sb
      .from("ministerial_meetings")
      .update(patch)
      .eq("id", meetingId)
      .select("id, church_totvs_id, title, meeting_date, public_token, expires_at, is_active, notes, created_at")
      .single();

    if (updateError) return json({ ok: false, error: "db_error_update_meeting", details: "erro interno" }, 500);

    return json({ ok: true, meeting: updated });
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
