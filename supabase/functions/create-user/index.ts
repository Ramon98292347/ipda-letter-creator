import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-admin-key",
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}

type Role = "admin" | "pastor" | "obreiro";
type ChurchClass = "estadual" | "setorial" | "central" | "regional" | "local";

type SessionClaims = {
  user_id: string;
  role: Role;
  active_totvs_id: string;
};

type TotvsAccessItem = {
  totvs_id: string;
  role: Role;
};

type Body = {
  cpf?: string;
  full_name?: string;
  role?: Role;
  totvs_access?: unknown;
  default_totvs_id?: string | null;
  password?: string | null;
  phone?: string | null;
  email?: string | null;
  birth_date?: string | null;
  baptism_date?: string | null;
  minister_role?: string | null;
  ministerio?: string | null;
  ordination_date?: string | null;
  rg?: string | null;
  marital_status?: string | null;
  matricula?: string | null;
  profession?: string | null;
  avatar_url?: string | null;
  cep?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  is_active?: boolean | null;
};

type ChurchRow = {
  totvs_id: string;
  parent_totvs_id: string | null;
  class: string | null;
};

function onlyDigits(value: string) {
  return String(value || "").replace(/\D+/g, "");
}

function normalizeChurchClass(value: string | null | undefined): ChurchClass | null {
  const safe = String(value || "").trim().toLowerCase();
  if (safe === "estadual" || safe === "setorial" || safe === "central" || safe === "regional" || safe === "local") {
    return safe;
  }
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

function normalizeTotvsAccess(input: unknown, fallbackRole: Role): TotvsAccessItem[] {
  if (!Array.isArray(input)) return [];
  const out: TotvsAccessItem[] = [];

  for (const item of input) {
    if (typeof item === "string") {
      const id = item.trim();
      if (id) out.push({ totvs_id: id, role: fallbackRole });
      continue;
    }

    if (!item || typeof item !== "object") continue;
    const id = String((item as Record<string, unknown>).totvs_id || "").trim();
    const roleRaw = String((item as Record<string, unknown>).role || fallbackRole).toLowerCase();
    const role: Role = roleRaw === "admin" || roleRaw === "pastor" || roleRaw === "obreiro" ? roleRaw : fallbackRole;
    if (id) out.push({ totvs_id: id, role });
  }

  const uniq = new Map<string, TotvsAccessItem>();
  for (const item of out) uniq.set(item.totvs_id, item);
  return [...uniq.values()];
}

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
    const adminKey = Deno.env.get("ADMIN_KEY") || "";
    const adminHeader = req.headers.get("x-admin-key") || "";
    const isAdminByKey = Boolean(adminKey && adminHeader && adminHeader === adminKey);
    const session = isAdminByKey ? null : await verifySessionJWT(req);

    if (!isAdminByKey && !session) return json({ ok: false, error: "unauthorized" }, 401);
    if (!isAdminByKey && session?.role === "obreiro") return json({ ok: false, error: "forbidden" }, 403);

    const body = (await req.json().catch(() => ({}))) as Body;
    const cpf = onlyDigits(body.cpf || "");
    const full_name = String(body.full_name || "").trim();
    if (cpf.length !== 11) return json({ ok: false, error: "invalid_cpf" }, 400);
    if (!full_name) return json({ ok: false, error: "missing_full_name" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

    // Comentario: verifica se o usuario ja existe (para nao alterar role em edicao).
    const { data: existingUser, error: existingErr } = await sb
      .from("users")
      .select("id, role")
      .eq("cpf", cpf)
      .maybeSingle();
    if (existingErr) return json({ ok: false, error: "db_error_existing_user", details: existingErr.message }, 500);

    // Comentario: regra de papel:
    // - Edicao: nunca altera o role, mantem o role atual.
    // - Pastor logado: sempre cadastra como obreiro (apenas para novo cadastro).
    // - Admin logado (JWT): pode cadastrar pastor ou obreiro.
    // - Fluxo tecnico (x-admin-key): pode usar qualquer role valida.
    const requestedRole = String(body.role || "obreiro").toLowerCase();
    let role: Role = "obreiro";
    if (existingUser?.role) {
      role = String(existingUser.role).toLowerCase() as Role;
    } else if (isAdminByKey) {
      if (!["admin", "pastor", "obreiro"].includes(requestedRole)) return json({ ok: false, error: "invalid_role" }, 400);
      role = requestedRole as Role;
    } else if (session?.role === "admin") {
      if (!["pastor", "obreiro"].includes(requestedRole)) return json({ ok: false, error: "invalid_role_for_admin" }, 400);
      role = requestedRole as Role;
    } else {
      role = "obreiro";
    }

    const { data: allChurches, error: allChurchesErr } = await sb
      .from("churches")
      .select("totvs_id, parent_totvs_id, class");
    if (allChurchesErr) return json({ ok: false, error: "db_error_churches", details: allChurchesErr.message }, 500);

    const churchRows = (allChurches || []) as ChurchRow[];
    const churchSet = new Set(churchRows.map((c) => String(c.totvs_id)));

    let totvsAccess = normalizeTotvsAccess(body.totvs_access, role);
    if (totvsAccess.length === 0 && session?.active_totvs_id) {
      totvsAccess = [{ totvs_id: session.active_totvs_id, role: "obreiro" }];
    }
    if (totvsAccess.length === 0) return json({ ok: false, error: "missing_totvs_access" }, 400);

    const invalidTotvs = totvsAccess.map((a) => a.totvs_id).filter((id) => !churchSet.has(id));
    if (invalidTotvs.length > 0) return json({ ok: false, error: "totvs_not_found", invalid_totvs: invalidTotvs }, 400);

    // Comentario: valida escopo do pastor para evitar cadastro fora da arvore.
    if (!isAdminByKey && session?.role === "pastor") {
      const activeClass = normalizeChurchClass(churchRows.find((c) => c.totvs_id === session.active_totvs_id)?.class);
      if (!activeClass) return json({ ok: false, error: "active_church_invalid_class" }, 403);

      const scope = computeScope(session.active_totvs_id, churchRows);
      const outOfScope = totvsAccess.map((a) => a.totvs_id).filter((id) => !scope.has(id));
      if (outOfScope.length > 0) {
        return json({ ok: false, error: "totvs_out_of_scope", out_of_scope: outOfScope }, 403);
      }
    }

    const default_totvs_id = String(body.default_totvs_id || "").trim() || totvsAccess[0].totvs_id;
    if (!churchSet.has(default_totvs_id)) return json({ ok: false, error: "default_totvs_not_found" }, 400);

    const password = String(body.password || "");
    const password_hash = password ? bcrypt.hashSync(password, 10) : null;

    const ministerio = String(body.ministerio || body.minister_role || "").trim();
    const payload: Record<string, unknown> = {
      cpf,
      full_name,
      role,
      phone: body.phone ?? null,
      email: body.email ?? null,
      birth_date: body.birth_date ?? null,
      baptism_date: body.baptism_date ?? null,
      ordination_date: body.ordination_date ?? null,
      // Comentario: salva sempre no campo oficial minister_role.
      minister_role: ministerio || null,
      rg: body.rg ?? null,
      marital_status: body.marital_status ?? null,
      matricula: body.matricula ?? null,
      profession: body.profession ?? null,
      avatar_url: body.avatar_url ?? null,
      cep: body.cep ?? null,
      address_street: body.address_street ?? null,
      address_number: body.address_number ?? null,
      address_complement: body.address_complement ?? null,
      address_neighborhood: body.address_neighborhood ?? null,
      address_city: body.address_city ?? null,
      address_state: body.address_state ?? null,
      totvs_access: totvsAccess,
      default_totvs_id,
      is_active: typeof body.is_active === "boolean" ? body.is_active : true,
    };
    if (password_hash) payload.password_hash = password_hash;

    const { data: saved, error: saveErr } = await sb
      .from("users")
      .upsert(payload, { onConflict: "cpf" })
      .select("id, cpf, full_name, role, default_totvs_id, totvs_access, is_active, updated_at")
      .single();
    if (saveErr) return json({ ok: false, error: "db_error_save_user", details: saveErr.message }, 500);

    return json({ ok: true, user: saved }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
