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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}

type Role = "admin" | "pastor" | "obreiro";
type ChurchClass = "estadual" | "setorial" | "central" | "regional" | "local";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };
type ChurchRow = { totvs_id: string; parent_totvs_id: string | null; class: string | null };
type Body = {
  search?: string;
  minister_role?: string;
  is_active?: boolean;
  roles?: Array<"pastor" | "obreiro">;
  church_totvs_id?: string;
  page?: number;
  page_size?: number;
};

function normalizeChurchClass(value: string | null | undefined): ChurchClass | null {
  const safe = String(value || "").trim().toLowerCase();
  if (safe === "estadual" || safe === "setorial" || safe === "central" || safe === "regional" || safe === "local") return safe;
  return null;
}

function computeScope(rootTotvs: string, churches: ChurchRow[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const c of churches) {
    const parent = String(c.parent_totvs_id || "");
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(String(c.totvs_id));
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

function parseTotvsAccess(raw: unknown): Array<{ totvs_id: string; role: Role }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ totvs_id: string; role: Role }> = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const id = item.trim();
      if (id) out.push({ totvs_id: id, role: "obreiro" });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const id = String((item as Record<string, unknown>).totvs_id || "").trim();
    const roleRaw = String((item as Record<string, unknown>).role || "obreiro").toLowerCase();
    const role: Role = roleRaw === "admin" || roleRaw === "pastor" || roleRaw === "obreiro" ? roleRaw : "obreiro";
    if (id) out.push({ totvs_id: id, role });
  }
  return out;
}

function canManageMember(
  sessionRole: Role,
  sessionActiveTotvs: string,
  memberDefaultTotvs: string,
  sessionChurchClass: ChurchClass | null,
  memberChurchClass: ChurchClass | null,
  scope: Set<string>,
): boolean {
  if (sessionRole === "admin") return true;
  if (!scope.has(memberDefaultTotvs)) return false;
  if (memberDefaultTotvs === sessionActiveTotvs) return true;
  if (!sessionChurchClass || !memberChurchClass) return false;
  const rank: Record<ChurchClass, number> = {
    estadual: 5,
    setorial: 4,
    central: 3,
    regional: 2,
    local: 1,
  };
  // Comentario: pastor nao pode mexer em igreja de nivel acima.
  return rank[memberChurchClass] <= rank[sessionChurchClass];
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
    const role = String(payload.role || "").toLowerCase() as Role;
    const active_totvs_id = String(payload.active_totvs_id || "");
    if (!user_id || !active_totvs_id) return null;
    if (!["admin", "pastor", "obreiro"].includes(role)) return null;
    return { user_id, role, active_totvs_id };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);
    if (session.role === "obreiro") return json({ ok: false, error: "forbidden" }, 403);

    const body = (await req.json().catch(() => ({}))) as Body;
    const page = Number.isFinite(body.page) ? Math.max(1, Number(body.page)) : 1;
    const page_size = Number.isFinite(body.page_size) ? Math.max(1, Math.min(200, Number(body.page_size))) : 20;
    const roles = Array.isArray(body.roles) && body.roles.length ? body.roles : ["pastor", "obreiro"];
    const churchTotvsFilter = String(body.church_totvs_id || "").trim();

    const sb = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

    const { data: churches, error: churchesErr } = await sb.from("churches").select("totvs_id,parent_totvs_id,class");
    if (churchesErr) return json({ ok: false, error: "db_error_churches", details: churchesErr.message }, 500);
    const churchRows = (churches || []) as ChurchRow[];
    const scope = computeScope(session.active_totvs_id, churchRows);
    if (churchTotvsFilter && !scope.has(churchTotvsFilter)) {
      return json({ ok: false, error: "forbidden_church_out_of_scope" }, 403);
    }
    const sessionChurchClass = normalizeChurchClass(churchRows.find((c) => c.totvs_id === session.active_totvs_id)?.class);
    const churchMap = new Map(churchRows.map((c) => [String(c.totvs_id), c]));

    let q = sb
      .from("users")
      .select(
        "id,full_name,role,cpf,rg,phone,email,profession,minister_role,birth_date,baptism_date,marital_status,matricula,ordination_date,avatar_url,signature_url,cep,address_street,address_number,address_complement,address_neighborhood,address_city,address_state,default_totvs_id,totvs_access,is_active,can_create_released_letter",
        { count: "exact" },
      )
      .in("role", roles)
      .order("full_name", { ascending: true });

    if (churchTotvsFilter) q = q.eq("default_totvs_id", churchTotvsFilter);

    if (typeof body.is_active === "boolean") q = q.eq("is_active", body.is_active);
    if (body.minister_role) q = q.eq("minister_role", body.minister_role);
    if (body.search) {
      const safe = String(body.search).replace(/"/g, "").trim();
      if (safe) q = q.or(`full_name.ilike.%${safe}%,cpf.ilike.%${safe}%,phone.ilike.%${safe}%`);
    }

    const { data: users, error: usersErr } = await q;
    if (usersErr) return json({ ok: false, error: "db_error_users", details: usersErr.message }, 500);

    const filtered = (users || []).filter((u: Record<string, unknown>) => {
      const defaultTotvs = String(u.default_totvs_id || "").trim();
      if (!defaultTotvs) return false;
      return scope.has(defaultTotvs);
    });

    const mapped = filtered.map((u: Record<string, unknown>) => {
      const defaultTotvs = String(u.default_totvs_id || "").trim();
      const targetClass = normalizeChurchClass(churchMap.get(defaultTotvs)?.class);
      const can_manage = canManageMember(
        session.role,
        session.active_totvs_id,
        defaultTotvs,
        sessionChurchClass,
        targetClass,
        scope,
      );
      return {
        ...u,
        can_manage,
      };
    });

    const total = mapped.length;
    const from = (page - 1) * page_size;
    const to = from + page_size;
    const pageRows = mapped.slice(from, to);

    return json({ ok: true, members: pageRows, total, page, page_size }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
