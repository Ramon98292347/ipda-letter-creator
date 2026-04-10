import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

type Role = "admin" | "pastor" | "secretario";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };

type Body = {
  action?: "get-page-settings" | "upsert-page-settings" | "clear-page-settings";
  church_totvs_id?: string;
  responsavel_user_id?: string;
};

type TotvsAccessItem = string | { totvs_id?: string; role?: string };

type ChurchRow = {
  totvs_id: string;
  parent_totvs_id: string | null;
};

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

function normalizeTotvsAccess(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  for (const item of arr as TotvsAccessItem[]) {
    if (typeof item === "string") {
      const id = String(item || "").trim();
      if (id) out.push(id);
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const id = String(item.totvs_id || "").trim();
    if (id) out.push(id);
  }
  return Array.from(new Set(out));
}

function buildDescendantsSet(roots: string[], churches: ChurchRow[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const church of churches) {
    const parent = String(church.parent_totvs_id || "").trim();
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(String(church.totvs_id || "").trim());
  }

  const allowed = new Set<string>();
  const queue = [...roots];

  while (queue.length > 0) {
    const current = String(queue.shift() || "").trim();
    if (!current || allowed.has(current)) continue;
    allowed.add(current);
    const nextChildren = children.get(current) || [];
    for (const child of nextChildren) queue.push(child);
  }

  return allowed;
}

async function verifySessionJWT(req: Request): Promise<SessionClaims | null> {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  const secret = Deno.env.get("USER_SESSION_JWT_SECRET") || "";
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(m[1].trim(), new TextEncoder().encode(secret), { algorithms: ["HS256"] });
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const session = await verifySessionJWT(req);
  if (!session) return json({ ok: false, error: "unauthorized" }, 401);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const action = String(body.action || "get-page-settings").trim() as Body["action"];
    const churchTotvsId = String(body.church_totvs_id || "").trim();

    if (!churchTotvsId) return json({ ok: false, error: "missing_church_totvs_id" }, 400);

    if (session.role !== "admin") {
      const [{ data: userRow, error: userErr }, { data: churchesRows, error: churchesErr }] = await Promise.all([
        sb.from("users").select("totvs_access, default_totvs_id").eq("id", session.user_id).maybeSingle(),
        sb.from("churches").select("totvs_id,parent_totvs_id"),
      ]);

      if (userErr) return json({ ok: false, error: "db_error_user" }, 500);
      if (churchesErr) return json({ ok: false, error: "db_error_churches" }, 500);

      const access = normalizeTotvsAccess(userRow?.totvs_access);
      const fallback = String(userRow?.default_totvs_id || session.active_totvs_id || "").trim();
      const roots = access.length > 0 ? access : fallback ? [fallback] : [];
      const allowed = buildDescendantsSet(roots, (churchesRows || []) as ChurchRow[]);

      if (!allowed.has(churchTotvsId)) {
        return json({ ok: false, error: "forbidden_scope" }, 403);
      }
    }

    if (action === "get-page-settings") {
      const { data, error } = await sb
        .from("public_shirt_page_settings")
        .select("id,page_totvs_id,responsavel_user_id,responsavel_nome,responsavel_telefone,responsavel_email,is_active,updated_at")
        .eq("page_totvs_id", churchTotvsId)
        .maybeSingle();

      if (error) return json({ ok: false, error: "db_error_get_settings" }, 500);
      return json({ ok: true, setting: data || null });
    }

    if (action === "clear-page-settings") {
      const { error } = await sb.from("public_shirt_page_settings").delete().eq("page_totvs_id", churchTotvsId);
      if (error) return json({ ok: false, error: "db_error_clear_settings" }, 500);
      return json({ ok: true });
    }

    if (action === "upsert-page-settings") {
      const responsavelUserId = String(body.responsavel_user_id || "").trim();
      if (!responsavelUserId) return json({ ok: false, error: "missing_responsavel_user_id" }, 400);

      const { data: user, error: uErr } = await sb
        .from("users")
        .select("id,full_name,phone,email,is_active")
        .eq("id", responsavelUserId)
        .eq("is_active", true)
        .maybeSingle();

      if (uErr) return json({ ok: false, error: "db_error_get_responsavel" }, 500);
      if (!user) return json({ ok: false, error: "responsavel_not_found" }, 404);

      const payload = {
        page_totvs_id: churchTotvsId,
        responsavel_user_id: String(user.id || ""),
        responsavel_nome: String(user.full_name || "").trim(),
        responsavel_telefone: user.phone ? String(user.phone) : null,
        responsavel_email: user.email ? String(user.email) : null,
        is_active: true,
        created_by_user_id: session.user_id,
        updated_by_user_id: session.user_id,
      };

      const { data, error } = await sb
        .from("public_shirt_page_settings")
        .upsert(payload, { onConflict: "page_totvs_id" })
        .select("id,page_totvs_id,responsavel_user_id,responsavel_nome,responsavel_telefone,responsavel_email,is_active,updated_at")
        .single();

      if (error) return json({ ok: false, error: "db_error_upsert_settings" }, 500);
      return json({ ok: true, setting: data });
    }

    return json({ ok: false, error: "invalid_action" }, 400);
  } catch {
    return json({ ok: false, error: "exception" }, 500);
  }
});
