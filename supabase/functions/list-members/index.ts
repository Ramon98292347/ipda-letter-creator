/**
 * list-members
 * ============
 * O que faz: Lista os membros (pastores e/ou obreiros) com paginação, filtros e métricas
 *            por função ministerial. Aplica regras de escopo hierárquico e calcula o campo
 *            can_manage (se o usuário logado pode editar aquele membro).
 * Para que serve: Usada na tela de gestão de obreiros (tabela de membros do sistema).
 * Quem pode usar: admin, pastor
 * Recebe: { search?, minister_role?, is_active?, roles?, church_totvs_id?, page?, page_size? }
 * Retorna: { ok, members, total, page, page_size, metrics }
 *          metrics: { total, pastor, presbitero, diacono, obreiro, membro }
 *          Cada membro inclui o campo can_manage (boolean).
 * Observações: O campo can_manage respeita a hierarquia: pastor não pode gerenciar membros
 *              de igrejas de nível igual ou acima do seu na hierarquia.
 */
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
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string; scope_totvs_ids?: string[] };
type ChurchRow = { totvs_id: string; parent_totvs_id: string | null; class: string | null };
type Body = {
  search?: string;
  minister_role?: string;
  is_active?: boolean;
  roles?: Array<"pastor" | "obreiro" | "secretario" | "financeiro">;
  church_totvs_id?: string;
  page?: number;
  page_size?: number;
};

function normalizeMinisterRole(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]+/g, " ")
    .trim();
}

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
  _sessionActiveTotvs: string,
  memberDefaultTotvs: string,
  _sessionChurchClass: ChurchClass | null,
  _memberChurchClass: ChurchClass | null,
  scope: Set<string>,
): boolean {
  if (sessionRole === "admin") return true;
  return scope.has(memberDefaultTotvs);
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
    const scope_totvs_ids = Array.isArray((payload as Record<string, unknown>).scope_totvs_ids)
      ? (payload as Record<string, unknown>).scope_totvs_ids as string[]
      : [];
    if (!user_id || !active_totvs_id) return null;
    if (!["admin", "pastor", "obreiro", "secretario", "financeiro"].includes(role)) return null;
    return { user_id, role, active_totvs_id, scope_totvs_ids };
  } catch {
    return null;
  }
}

async function resolveScopeRootTotvs(
  sb: ReturnType<typeof createClient>,
  session: SessionClaims,
): Promise<string> {
  if (session.role !== "pastor") return session.active_totvs_id;

  const { data, error } = await sb
    .from("churches")
    .select("totvs_id")
    .eq("pastor_user_id", session.user_id)
    .eq("is_active", true);

  if (error || !data || data.length === 0) return session.active_totvs_id;

  const pastorChurches = data.map((row: Record<string, unknown>) => String(row.totvs_id || "")).filter(Boolean);
  if (pastorChurches.includes(session.active_totvs_id)) return session.active_totvs_id;
  return pastorChurches[0];
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
    const page_size = Number.isFinite(body.page_size) ? Math.max(1, Math.min(1000, Number(body.page_size))) : 20;
    const roles = Array.isArray(body.roles) && body.roles.length ? body.roles : ["pastor", "obreiro"];
    const churchTotvsFilter = String(body.church_totvs_id || "").trim();

    const sb = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

    const { data: churches, error: churchesErr } = await sb.from("churches").select("totvs_id,parent_totvs_id,class");
    if (churchesErr) return json({ ok: false, error: "db_error_churches", details: "erro interno" }, 500);
    const churchRows = (churches || []) as ChurchRow[];
    let scopeRootTotvs = session.active_totvs_id;
    let scope: Set<string>;
    if (session.role === "admin") {
      // Comentario: admin enxerga membros de todas as igrejas.
      scope = new Set(churchRows.map((c) => String(c.totvs_id)).filter(Boolean));
      if (churchTotvsFilter && !scope.has(churchTotvsFilter)) {
        return json({ ok: false, error: "church_not_found" }, 404);
      }
    } else {
      scopeRootTotvs = await resolveScopeRootTotvs(sb, session);
      // Comentario: escopo sempre calculado da igreja efetiva do pastor (churches.pastor_user_id).
      scope = computeScope(scopeRootTotvs, churchRows);
      if (churchTotvsFilter && !scope.has(churchTotvsFilter)) {
        return json({ ok: false, error: "forbidden_church_out_of_scope" }, 403);
      }
    }
    const sessionChurchClass = normalizeChurchClass(churchRows.find((c) => c.totvs_id === scopeRootTotvs)?.class);
    const churchMap = new Map(churchRows.map((c) => [String(c.totvs_id), c]));

    const scopeArray = Array.from(scope);
    const sqlFilterTotvs = churchTotvsFilter || (scopeArray.length <= 500 ? null : null);

    let q = sb
      .from("users")
      .select(
        "id,full_name,role,cpf,rg,phone,email,profession,minister_role,birth_date,baptism_date,marital_status,matricula,ordination_date,avatar_url,signature_url,cep,address_street,address_number,address_complement,address_neighborhood,address_city,address_state,default_totvs_id,totvs_access,is_active,can_create_released_letter,payment_status,payment_block_reason",
        { count: "exact" },
      )
      .in("role", roles)
      .order("full_name", { ascending: true });

    if (churchTotvsFilter) {
      q = q.eq("default_totvs_id", churchTotvsFilter);
    } else if (scopeArray.length <= 500) {
      q = q.in("default_totvs_id", scopeArray);
    }

    if (typeof body.is_active === "boolean") q = q.eq("is_active", body.is_active);
    if (body.search) {
      const safe = String(body.search).replace(/"/g, "").trim();
      if (safe) q = q.or(`full_name.ilike.%${safe}%,cpf.ilike.%${safe}%,phone.ilike.%${safe}%`);
    }

    const { data: users, error: usersErr } = await q;
    if (usersErr) return json({ ok: false, error: "db_error_users", details: "erro interno" }, 500);

    const normalizedRoleFilter = body.minister_role ? normalizeMinisterRole(body.minister_role) : null;

    const filtered = (users || []).filter((u: Record<string, unknown>) => {
      const defaultTotvs = String(u.default_totvs_id || "").trim();
      if (!defaultTotvs) return false;
      if (scopeArray.length > 500 && !scope.has(defaultTotvs)) return false;
      if (normalizedRoleFilter && normalizeMinisterRole(u.minister_role) !== normalizedRoleFilter) return false;
      return true;
    });

    const mapped = filtered.map((u: Record<string, unknown>) => {
      const defaultTotvs = String(u.default_totvs_id || "").trim();
      const targetClass = normalizeChurchClass(churchMap.get(defaultTotvs)?.class);
      const can_manage = canManageMember(
        session.role,
        scopeRootTotvs,
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

    const attendanceByUser = new Map<string, { status: string; meeting_date: string | null; absences180: number }>();
    const memberIds = mapped.map((member) => String((member as Record<string, unknown>)?.id || "").trim()).filter(Boolean);
    if (memberIds.length > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 180);
      const cutoffDate = cutoff.toISOString().slice(0, 10);

      const { data: attendanceRows, error: attendanceErr } = await sb
        .from("ministerial_meeting_attendance")
        .select("user_id,status,meeting_date,updated_at")
        .in("user_id", memberIds)
        .gte("meeting_date", cutoffDate)
        .order("meeting_date", { ascending: false })
        .order("updated_at", { ascending: false });

      if (attendanceErr) {
        return json({ ok: false, error: "db_error_attendance", details: "erro interno" }, 500);
      }

      for (const rawRow of attendanceRows || []) {
        const row = rawRow as Record<string, unknown>;
        const userId = String(row.user_id || "").trim();
        if (!userId) continue;
        const status = String(row.status || "").trim().toUpperCase() || "SEM_REGISTRO";
        const meetingDate = String(row.meeting_date || "").trim() || null;
        const current = attendanceByUser.get(userId);
        if (!current) {
          attendanceByUser.set(userId, {
            status,
            meeting_date: meetingDate,
            absences180: status === "FALTA" ? 1 : 0,
          });
          continue;
        }
        current.absences180 += status === "FALTA" ? 1 : 0;
      }
    }

    const total = mapped.length;
    const metrics = {
      total,
      pastor: 0,
      presbitero: 0,
      diacono: 0,
      obreiro: 0,
      membro: 0,
      inativos: 0,
    };
    for (const member of mapped as Array<Record<string, unknown>>) {
      const role = normalizeMinisterRole(member.minister_role);
      if (role === "pastor") metrics.pastor += 1;
      else if (role === "presbitero") metrics.presbitero += 1;
      else if (role === "diacono") metrics.diacono += 1;
      else if (role === "membro") metrics.membro += 1;
      else if (role === "obreiro" || role === "cooperador" || role === "obreiro cooperador") metrics.obreiro += 1;
      if (member.is_active === false) metrics.inativos += 1;
    }
    const from = (page - 1) * page_size;
    const to = from + page_size;
    const pageRows = mapped.slice(from, to).map((member) => {
      const userId = String((member as Record<string, unknown>)?.id || "").trim();
      const attendance = attendanceByUser.get(userId);
      return {
        ...member,
        attendance_status: attendance?.status || "SEM_REGISTRO",
        attendance_meeting_date: attendance?.meeting_date || null,
        attendance_absences_180_days: attendance?.absences180 || 0,
      };
    });

    return json({ ok: true, members: pageRows, total, page, page_size, metrics }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
