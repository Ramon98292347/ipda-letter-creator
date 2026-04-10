import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

type Role = "admin" | "pastor" | "obreiro" | "secretario" | "financeiro";
type FeedbackStatus = "NOVO" | "EM_ANALISE" | "CONCLUIDO" | "ARQUIVADO";

type SessionClaims = {
  user_id: string;
  role: Role;
  active_totvs_id: string;
};

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return createClient(url, key);
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

function toRating(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isInteger(n)) return null;
  if (n < 1 || n > 5) return null;
  return n;
}

function toFeedbackStatus(value: unknown): FeedbackStatus | null {
  const v = String(value || "").toUpperCase().trim();
  if (v === "NOVO" || v === "EM_ANALISE" || v === "CONCLUIDO" || v === "ARQUIVADO") return v;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "").trim().toLowerCase();

  const session = await verifySessionJWT(req);
  if (!session) return json({ ok: false, error: "unauthorized" }, 401);

  const sb = getAdminClient();

  if (action === "submit") {
    const usability_rating = toRating(body.usability_rating);
    const speed_rating = toRating(body.speed_rating);
    const stability_rating = toRating(body.stability_rating);
    const overall_rating = toRating(body.overall_rating);
    const recommend_level = String(body.recommend_level || "").toUpperCase().trim();
    const primary_need = String(body.primary_need || "").trim() || null;
    const improvement_notes = String(body.improvement_notes || "").trim() || null;
    const contact_allowed = Boolean(body.contact_allowed);

    if (!usability_rating || !speed_rating || !stability_rating || !overall_rating) {
      return json({ ok: false, error: "ratings_required" }, 400);
    }
    if (!["SIM", "TALVEZ", "NAO"].includes(recommend_level)) {
      return json({ ok: false, error: "invalid_recommend_level" }, 400);
    }
    if (improvement_notes && improvement_notes.length > 2000) {
      return json({ ok: false, error: "improvement_notes_too_long" }, 400);
    }

    const { data: me } = await sb
      .from("users")
      .select("id, full_name")
      .eq("id", session.user_id)
      .maybeSingle();

    const { data, error } = await sb
      .from("user_feedback")
      .insert({
        user_id: session.user_id,
        user_name: String(me?.full_name || "").trim() || null,
        user_role: session.role,
        church_totvs_id: session.active_totvs_id,
        usability_rating,
        speed_rating,
        stability_rating,
        overall_rating,
        recommend_level,
        primary_need,
        improvement_notes,
        contact_allowed,
      })
      .select("id, created_at")
      .single();

    if (error) return json({ ok: false, error: "db_error_submit_feedback", details: "erro interno" }, 500);
    return json({ ok: true, feedback: data }, 200);
  }

  if (action === "list") {
    if (session.role !== "admin") return json({ ok: false, error: "forbidden" }, 403);

    const page = Math.max(1, Number(body.page || 1));
    const pageSize = Math.max(1, Math.min(100, Number(body.page_size || 20)));
    const status = toFeedbackStatus(body.status);
    const search = String(body.search || "").trim();

    let query = sb
      .from("user_feedback")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (status) query = query.eq("status", status);
    if (search) {
      const safe = search.replace(/,/g, " ");
      query = query.or(`user_name.ilike.%${safe}%,improvement_notes.ilike.%${safe}%,primary_need.ilike.%${safe}%`);
    }

    const { data, error, count } = await query;
    if (error) return json({ ok: false, error: "db_error_list_feedback", details: "erro interno" }, 500);
    return json({ ok: true, feedback: data || [], total: Number(count || 0), page, page_size: pageSize }, 200);
  }

  if (action === "update-status") {
    if (session.role !== "admin") return json({ ok: false, error: "forbidden" }, 403);
    const id = String(body.id || "").trim();
    const status = toFeedbackStatus(body.status);
    const admin_notes = String(body.admin_notes || "").trim() || null;
    if (!id) return json({ ok: false, error: "id_required" }, 400);
    if (!status) return json({ ok: false, error: "invalid_status" }, 400);

    const { data, error } = await sb
      .from("user_feedback")
      .update({
        status,
        admin_notes,
        reviewed_by_user_id: session.user_id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) return json({ ok: false, error: "db_error_update_feedback", details: "erro interno" }, 500);
    return json({ ok: true, feedback: data }, 200);
  }

  return json({ ok: false, error: "invalid_action", message: 'Use: "submit", "list", "update-status"' }, 400);
});
