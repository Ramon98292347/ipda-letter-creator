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

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders() });
}

type Role = "admin" | "pastor" | "obreiro";

type SessionClaims = {
  user_id: string;
  role: Role;
  active_totvs_id: string;
};

type Body = {
  date_start?: string;
  date_end?: string;
  page?: number;
  page_size?: number;
};

async function verifySessionJWT(req: Request): Promise<SessionClaims | null> {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  const token = m[1].trim();
  const secret = Deno.env.get("USER_SESSION_JWT_SECRET") || "";
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));

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

function isYYYYMMDD(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

function startOfDayISO(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0)).toISOString();
}

function endOfDayISO(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59)).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;

    const page = Number.isFinite(body.page) ? Math.max(1, Number(body.page)) : 1;
    const pageSizeRaw = Number.isFinite(body.page_size) ? Number(body.page_size) : 20;
    const page_size = Math.min(100, Math.max(1, pageSizeRaw));
    const from = (page - 1) * page_size;
    const to = from + page_size - 1;

    const dateStart = String(body.date_start || "").trim();
    const dateEnd = String(body.date_end || "").trim();

    if (dateStart && !isYYYYMMDD(dateStart)) {
      return json({ ok: false, error: "invalid_date_start", expected: "YYYY-MM-DD" }, 400);
    }
    if (dateEnd && !isYYYYMMDD(dateEnd)) {
      return json({ ok: false, error: "invalid_date_end", expected: "YYYY-MM-DD" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceRoleKey);

    const user_id = session.user_id;
    const activeTotvs = session.active_totvs_id;

    const { data: user, error: uErr } = await sb
      .from("users")
      .select(
        "id, role, full_name, cpf, phone, email, birth_date, minister_role, avatar_url, cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, default_totvs_id, is_active, signature_url, stamp_pastor_url"
      )
      .eq("id", user_id)
      .maybeSingle();

    if (uErr) return json({ ok: false, error: "db_error_user", details: uErr.message }, 500);
    if (!user) return json({ ok: false, error: "user_not_found" }, 404);
    if (!user.is_active) return json({ ok: false, error: "inactive_user" }, 403);

    const { data: church, error: cErr } = await sb
      .from("churches")
      .select("*")
      .eq("totvs_id", activeTotvs)
      .maybeSingle();

    if (cErr) return json({ ok: false, error: "db_error_church", details: cErr.message }, 500);
    if (!church) return json({ ok: false, error: "church_not_found" }, 404);

    let q = sb
      .from("letters")
      .select(
        "id, preacher_name, minister_role, preach_date, church_origin, church_destination, status, storage_path, created_at",
        { count: "exact" }
      )
      .eq("church_totvs_id", activeTotvs)
      .neq("status", "EXCLUIDA");

    const preacherName = String(user.full_name || "").trim();
    if (preacherName) {
      const safeName = preacherName.replace(/[%,"']/g, "").trim();
      q = q.or(`preacher_user_id.eq.${user_id},and(preacher_user_id.is.null,preacher_name.ilike.%${safeName}%)`);
    } else {
      q = q.eq("preacher_user_id", user_id);
    }

    if (dateStart) q = q.gte("created_at", startOfDayISO(dateStart));
    if (dateEnd) q = q.lte("created_at", endOfDayISO(dateEnd));

    q = q.order("created_at", { ascending: false }).range(from, to);

    const { data: letters, error: lErr, count } = await q;
    if (lErr) return json({ ok: false, error: "db_error_letters", details: lErr.message }, 500);

    return json(
      {
        ok: true,
        user,
        church,
        page,
        page_size,
        total: count || 0,
        letters: letters || [],
      },
      200
    );
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
