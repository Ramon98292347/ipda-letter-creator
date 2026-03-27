/**
 * members-api
 * ===========
 * Função unificada que roteia ações de gestão de membros/obreiros.
 *
 * Campos do body:
 *   action: "save"          → salva/cria usuário (requer JWT: admin/pastor/secretario OU x-admin-key)
 *   action: "save-profile"  → atualiza o próprio perfil (requer JWT: qualquer role)
 *   action: "get-profile"   → obtém o próprio perfil (requer JWT: qualquer role)
 *   action: "upload-photo"  → faz upload de foto de obreiro (requer JWT: qualquer role)
 *   action: "update-avatar" → atualiza avatar por user_id + cpf (uso publico do cadastro)
 *   action: "upsert-stamps" → salva assinatura/carimbos do usuario e da igreja ativa
 *   action: "list-members"  → lista membros com filtros e resumo de presenca
 *   action: "list-workers"  → lista obreiros com filtros
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers compartilhados
// ─────────────────────────────────────────────────────────────────────────────

// Comentario: headers CORS necessários para chamadas do frontend.
// Incluímos x-admin-key para que a action "save" possa ser chamada
// com chave de administrador master.
function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-admin-key, x-client-info",
  };
}

// Comentario: retorna JSON com status HTTP e headers CORS já incluídos.
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

// Comentario: secretario = 2°/3° pastor. financeiro = role futuro.
type Role = "admin" | "pastor" | "obreiro" | "secretario" | "financeiro";
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

type ChurchRow = {
  totvs_id: string;
  parent_totvs_id: string | null;
  church_name?: string | null;
  class: string | null;
};

type ListMembersBody = {
  search?: string;
  minister_role?: string;
  is_active?: boolean;
  roles?: Array<"pastor" | "obreiro" | "secretario" | "financeiro">;
  church_totvs_id?: string;
  page?: number;
  page_size?: number;
};

type ListWorkersBody = {
  search?: string;
  minister_role?: string;
  is_active?: boolean;
  include_pastor?: boolean;
  page?: number;
  page_size?: number;
};

type ChangeMemberChurchBody = {
  user_id?: string;
  target_totvs_id?: string;
};

type ChangeMemberAccessBody = {
  user_id?: string;
  role?: "obreiro" | "secretario" | "financeiro";
};

// ─────────────────────────────────────────────────────────────────────────────
// Verificação de JWT de sessão
// ─────────────────────────────────────────────────────────────────────────────

// Comentario: valida o token Bearer enviado no header Authorization.
// Retorna os dados da sessão (user_id, role, active_totvs_id) ou null se inválido.
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

// ─────────────────────────────────────────────────────────────────────────────
// Funções auxiliares para a action "save"
// ─────────────────────────────────────────────────────────────────────────────

// Comentario: remove todos os caracteres que não sejam dígitos de uma string.
function onlyDigits(value: string) {
  return String(value || "").replace(/\D+/g, "");
}

// Comentario: garante que o valor de classe da igreja é um dos valores válidos
// ou retorna null se não reconhecer.
function normalizeChurchClass(value: string | null | undefined): ChurchClass | null {
  const safe = String(value || "").trim().toLowerCase();
  if (
    safe === "estadual" ||
    safe === "setorial" ||
    safe === "central" ||
    safe === "regional" ||
    safe === "local"
  ) {
    return safe;
  }
  return null;
}

function normalizeMinisterRole(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]+/g, " ")
    .trim();
}

// Comentario: calcula o conjunto de igrejas que o pastor pode gerenciar —
// a sua própria igreja e todas as filhas, netas etc.
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
  return rank[memberChurchClass] <= rank[sessionChurchClass];
}

// Comentario: normaliza o campo totvs_access que pode chegar como array de
// strings ou array de objetos {totvs_id, role}. Remove duplicatas.
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
    const role: Role =
      roleRaw === "admin" || roleRaw === "pastor" || roleRaw === "obreiro" || roleRaw === "secretario" || roleRaw === "financeiro"
        ? roleRaw
        : fallbackRole;
    if (id) out.push({ totvs_id: id, role });
  }

  // Comentario: remove totvs_ids duplicados mantendo o último encontrado.
  const uniq = new Map<string, TotvsAccessItem>();
  for (const item of out) uniq.set(item.totvs_id, item);
  return [...uniq.values()];
}

// ─────────────────────────────────────────────────────────────────────────────
// Parâmetros de crop 3x4 para upload de foto (não alterar)
// ─────────────────────────────────────────────────────────────────────────────
const PAD_TOP = 0.22;    // espaço acima do rosto
const PAD_BOTTOM = 1.20; // espaço abaixo do queixo (usado como referência de CROP_H)
const PAD_SIDES = 0.38;  // espaço lateral
const CROP_H = 1.90;     // altura total = face_h * CROP_H
const CY_OFFSET = 0.28;  // offset vertical do centro
const OUT_W = 600;       // largura final em pixels
const OUT_H = 800;       // altura final em pixels

// ─────────────────────────────────────────────────────────────────────────────
// Handler: action "save" — cria ou atualiza um usuário (save-user original)
// ─────────────────────────────────────────────────────────────────────────────

// Comentario: tipo do body esperado para a action "save".
type SaveBody = {
  id?: string;
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
  can_create_released_letter?: boolean | null;
};

async function handleSave(
  req: Request,
  body: SaveBody,
  isAdminByKey: boolean,
  session: SessionClaims | null
): Promise<Response> {
  const requestedId = String(body.id || "").trim();
  const cpfInput = onlyDigits(body.cpf || "");
  const fullNameInput = String(body.full_name || "").trim();

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  );

  // Comentario: busca o usuário já existente pelo ID ou pelo CPF para decidir
  // se será insert ou update.
  let existingQuery = sb
    .from("users")
    .select("id, role, matricula, cpf, full_name")
    .limit(1);

  if (requestedId) {
    existingQuery = existingQuery.eq("id", requestedId);
  } else {
    existingQuery = existingQuery.eq("cpf", cpfInput);
  }

  const { data: existingRows, error: existingErr } = await existingQuery;
  if (existingErr) return json({ ok: false, error: "db_error_existing_user" }, 500);
  const existingUser = Array.isArray(existingRows) ? existingRows[0] || null : null;

  const cpf = cpfInput || String(existingUser?.cpf || "").trim();
  const full_name = fullNameInput || String(existingUser?.full_name || "").trim();
  if (cpf.length !== 11) return json({ ok: false, error: "invalid_cpf" }, 400);
  if (!full_name) return json({ ok: false, error: "missing_full_name" }, 400);

  // Comentario: o role do usuário existente nunca é trocado pela edição.
  // Apenas na criação o role informado é considerado.
  const requestedRole = String(body.role || "obreiro").toLowerCase();
  let role: Role = "obreiro";
  if (existingUser?.role) {
    role = String(existingUser.role).toLowerCase() as Role;
  } else if (isAdminByKey) {
    // Comentario: admin master pode criar qualquer role incluindo secretario e financeiro.
    if (!["admin", "pastor", "obreiro", "secretario", "financeiro"].includes(requestedRole)) {
      return json({ ok: false, error: "invalid_role" }, 400);
    }
    role = requestedRole as Role;
  } else if (session?.role === "admin") {
    // Comentario: admin comum pode criar pastor, obreiro, secretario e financeiro.
    if (!["pastor", "obreiro", "secretario", "financeiro"].includes(requestedRole)) {
      return json({ ok: false, error: "invalid_role_for_admin" }, 400);
    }
    role = requestedRole as Role;
  } else {
    role = "obreiro";
  }

  const { data: allChurches, error: allChurchesErr } = await sb
    .from("churches")
    .select("totvs_id, parent_totvs_id, class");
  if (allChurchesErr) return json({ ok: false, error: "db_error_churches" }, 500);

  const churchRows = (allChurches || []) as ChurchRow[];
  const churchSet = new Set(churchRows.map((c) => String(c.totvs_id)));

  let totvsAccess = normalizeTotvsAccess(body.totvs_access, role);
  if (totvsAccess.length === 0 && session?.active_totvs_id) {
    totvsAccess = [{ totvs_id: session.active_totvs_id, role: "obreiro" }];
  }
  if (totvsAccess.length === 0) return json({ ok: false, error: "missing_totvs_access" }, 400);

  const invalidTotvs = totvsAccess.map((a) => a.totvs_id).filter((id) => !churchSet.has(id));
  if (invalidTotvs.length > 0) {
    return json({ ok: false, error: "totvs_not_found", invalid_totvs: invalidTotvs }, 400);
  }

  // Comentario: pastor só consegue cadastrar usuário dentro do próprio escopo de igrejas.
  if (!isAdminByKey && session?.role === "pastor") {
    const activeClass = normalizeChurchClass(
      churchRows.find((c) => c.totvs_id === session.active_totvs_id)?.class
    );
    if (!activeClass) return json({ ok: false, error: "active_church_invalid_class" }, 403);

    const scope = computeScope(session.active_totvs_id, churchRows);
    const outOfScope = totvsAccess.map((a) => a.totvs_id).filter((id) => !scope.has(id));
    if (outOfScope.length > 0) {
      return json({ ok: false, error: "totvs_out_of_scope", out_of_scope: outOfScope }, 403);
    }
  }

  const default_totvs_id =
    String(body.default_totvs_id || "").trim() || totvsAccess[0].totvs_id;
  if (!churchSet.has(default_totvs_id)) {
    return json({ ok: false, error: "default_totvs_not_found" }, 400);
  }

  const password = String(body.password || "");
  const password_hash = password ? bcrypt.hashSync(password, 10) : null;

  const ministerio = String(body.ministerio || body.minister_role || "").trim();
  const matriculaInput = String(body.matricula || "").trim();
  const matriculaFinal =
    matriculaInput ||
    String((existingUser as Record<string, unknown> | undefined)?.matricula || "").trim() ||
    (cpf ? `${cpf.slice(-6)}${Date.now().toString().slice(-4)}` : "");

  const savePayload: Record<string, unknown> = {
    ...(existingUser?.id ? { id: existingUser.id } : {}),
    cpf,
    full_name,
    role,
    phone: body.phone ?? null,
    email: body.email ?? null,
    birth_date: body.birth_date ?? null,
    baptism_date: body.baptism_date ?? null,
    ordination_date: body.ordination_date ?? null,
    minister_role: ministerio || null,
    rg: body.rg ?? null,
    marital_status: body.marital_status ?? null,
    ...(matriculaFinal ? { matricula: matriculaFinal } : {}),
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
    can_create_released_letter:
      typeof body.can_create_released_letter === "boolean"
        ? body.can_create_released_letter
        : false,
  };
  if (password_hash) savePayload.password_hash = password_hash;

  const { data: saved, error: saveErr } = await sb
    .from("users")
    .upsert(savePayload, { onConflict: "cpf" })
    .select(
      "id, cpf, full_name, role, default_totvs_id, totvs_access, is_active, can_create_released_letter, updated_at"
    )
    .single();
  if (saveErr) return json({ ok: false, error: "db_error_save_user" }, 500);

  return json({ ok: true, user: saved }, 200);
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler: action "save-profile" — atualiza o próprio cadastro (save-my-profile original)
// ─────────────────────────────────────────────────────────────────────────────

// Comentario: tipo do body esperado para a action "save-profile".
type SaveProfileBody = {
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  birth_date?: string | null;
  baptism_date?: string | null;
  ordination_date?: string | null;
  minister_role?: string | null;
  avatar_url?: string | null;
  cep?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
};

type UpdateAvatarBody = {
  user_id?: string;
  cpf?: string;
  avatar_url?: string;
};

type UpsertStampsBody = {
  signature_url?: string | null;
  stamp_pastor_url?: string | null;
  stamp_church_url?: string | null;
};

async function handleSaveProfile(
  session: SessionClaims,
  body: SaveProfileBody
): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const sb = createClient(supabaseUrl, serviceRoleKey);

  // Comentario: esta action permite ao usuário atualizar apenas o próprio
  // cadastro, sem abrir permissão geral de update por RLS.
  const incomingFullName = String(body.full_name || "").trim();
  let resolvedFullName = incomingFullName || null;
  if (!resolvedFullName) {
    const { data: currentUser } = await sb
      .from("users")
      .select("full_name")
      .eq("id", session.user_id)
      .maybeSingle();
    resolvedFullName = String((currentUser as Record<string, unknown> | null)?.full_name || "").trim() || null;
  }

  const profilePayload = {
    full_name: resolvedFullName,
    phone: String(body.phone || "").trim() || null,
    email: String(body.email || "").trim() || null,
    birth_date: String(body.birth_date || "").trim() || null,
    baptism_date: String(body.baptism_date || "").trim() || null,
    ordination_date: String(body.ordination_date || "").trim() || null,
    minister_role: String(body.minister_role || "").trim() || null,
    avatar_url: String(body.avatar_url || "").trim() || null,
    cep: String(body.cep || "").trim() || null,
    address_street: String(body.address_street || "").trim() || null,
    address_number: String(body.address_number || "").trim() || null,
    address_complement: String(body.address_complement || "").trim() || null,
    address_neighborhood: String(body.address_neighborhood || "").trim() || null,
    address_city: String(body.address_city || "").trim() || null,
    address_state: String(body.address_state || "").trim().toUpperCase() || null,
  };

  if (!profilePayload.full_name) return json({ ok: false, error: "missing_full_name" }, 400);
  if (!profilePayload.phone) return json({ ok: false, error: "missing_phone" }, 400);

  const { data, error } = await sb
    .from("users")
    .update(profilePayload)
    .eq("id", session.user_id)
    .select(
      "id, full_name, phone, email, birth_date, baptism_date, ordination_date, minister_role, avatar_url, cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, is_active, can_create_released_letter"
    )
    .single();

  if (error) return json({ ok: false, error: "db_error_update_profile" }, 500);

  return json({ ok: true, profile: data }, 200);
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler: action "get-profile" — obtém o próprio perfil (get-my-profile original)
// ─────────────────────────────────────────────────────────────────────────────

async function handleGetProfile(session: SessionClaims): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const sb = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await sb
    .from("users")
    .select(
      "id, full_name, phone, email, birth_date, baptism_date, ordination_date, minister_role, avatar_url, cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, is_active, can_create_released_letter"
    )
    .eq("id", session.user_id)
    .single();

  if (error) return json({ ok: false, error: "db_error_get_profile" }, 500);

  return json({ ok: true, profile: data }, 200);
}

async function handleUpdateAvatar(body: UpdateAvatarBody): Promise<Response> {
  const userId = String(body.user_id || "").trim();
  const cpf = onlyDigits(body.cpf || "");
  const avatarUrl = String(body.avatar_url || "").trim();

  if (!userId) return json({ ok: false, error: "user_id_required" }, 400);
  if (cpf.length !== 11) return json({ ok: false, error: "cpf_required" }, 400);
  if (!avatarUrl) return json({ ok: false, error: "avatar_url_required" }, 400);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );

  const { data: user, error: findErr } = await sb
    .from("users")
    .select("id")
    .eq("id", userId)
    .eq("cpf", cpf)
    .maybeSingle();

  if (findErr) return json({ ok: false, error: "db_error", details: findErr.message }, 500);
  if (!user) return json({ ok: false, error: "user_not_found" }, 404);

  const { error: updateErr } = await sb
    .from("users")
    .update({ avatar_url: avatarUrl })
    .eq("id", userId);

  if (updateErr) return json({ ok: false, error: "update_failed", details: updateErr.message }, 500);
  return json({ ok: true, avatar_url: avatarUrl }, 200);
}

async function handleUpsertStamps(session: SessionClaims, body: UpsertStampsBody): Promise<Response> {
  if (session.role !== "admin" && session.role !== "pastor") {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const signatureUrl = body.signature_url === undefined ? undefined : String(body.signature_url || "").trim() || null;
  const stampPastorUrl = body.stamp_pastor_url === undefined ? undefined : String(body.stamp_pastor_url || "").trim() || null;
  const stampChurchUrl = body.stamp_church_url === undefined ? undefined : String(body.stamp_church_url || "").trim() || null;

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );

  const userPayload: Record<string, string | null> = {};
  if (signatureUrl !== undefined) userPayload.signature_url = signatureUrl;
  if (stampPastorUrl !== undefined) userPayload.stamp_pastor_url = stampPastorUrl;

  if (Object.keys(userPayload).length > 0) {
    const { error: userErr } = await sb
      .from("users")
      .update(userPayload)
      .eq("id", session.user_id);
    if (userErr) return json({ ok: false, error: "db_error_update_user_stamps", details: userErr.message }, 500);
  }

  if (stampChurchUrl !== undefined) {
    const { error: churchErr } = await sb
      .from("churches")
      .update({ stamp_church_url: stampChurchUrl })
      .eq("totvs_id", session.active_totvs_id);
    if (churchErr) return json({ ok: false, error: "db_error_update_church_stamp", details: churchErr.message }, 500);
  }

  return json({
    ok: true,
    stamps: {
      signature_url: signatureUrl ?? null,
      stamp_pastor_url: stampPastorUrl ?? null,
      stamp_church_url: stampChurchUrl ?? null,
    },
  }, 200);
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler: action "upload-photo" — upload de foto de obreiro (upload-obreiro-photo original)
// ─────────────────────────────────────────────────────────────────────────────

// Comentario: detecta o rosto por variância de luminância em grade 8x8.
// Retorna {x, y, w, h} em proporção da imagem (0.0 a 1.0)
// ou null se não encontrar rosto.
function detectarRostoPorLuminancia(
  pixels: Uint8Array,
  imgW: number,
  imgH: number
): { x: number; y: number; w: number; h: number } | null {
  const GRID = 8; // grade 8x8
  const cellW = Math.floor(imgW / GRID);
  const cellH = Math.floor(imgH / GRID);

  // Calcular a variância de cada célula da grade
  const variancias: number[][] = Array.from({ length: GRID }, () =>
    new Array(GRID).fill(0)
  );

  let maxVar = 0;
  let maxRow = -1;
  let maxCol = -1;

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const startX = col * cellW;
      const startY = row * cellH;

      // Calcular luminância média da célula
      let soma = 0;
      let count = 0;
      for (let y = startY; y < startY + cellH && y < imgH; y++) {
        for (let x = startX; x < startX + cellW && x < imgW; x++) {
          const idx = (y * imgW + x) * 4;
          // Fórmula de luminância: 0.299R + 0.587G + 0.114B
          const lum = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
          soma += lum;
          count++;
        }
      }
      const media = soma / count;

      // Calcular variância
      let somaVar = 0;
      for (let y = startY; y < startY + cellH && y < imgH; y++) {
        for (let x = startX; x < startX + cellW && x < imgW; x++) {
          const idx = (y * imgW + x) * 4;
          const lum = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
          somaVar += Math.pow(lum - media, 2);
        }
      }
      variancias[row][col] = somaVar / count;

      if (variancias[row][col] > maxVar) {
        maxVar = variancias[row][col];
        maxRow = row;
        maxCol = col;
      }
    }
  }

  // Se não encontrou variância significativa, não há rosto
  if (maxVar < 100 || maxRow < 0) return null;

  // Estimamos a caixa do rosto ao redor da célula de maior variância.
  // Assumimos que o rosto ocupa ~3x3 células centradas na de maior variância.
  const faceGridW = 3;
  const faceGridH = 4;
  const startCol = Math.max(0, maxCol - Math.floor(faceGridW / 2));
  const startRow = Math.max(0, maxRow - Math.floor(faceGridH / 2));
  const endCol = Math.min(GRID, startCol + faceGridW);
  const endRow = Math.min(GRID, startRow + faceGridH);

  return {
    x: (startCol * cellW) / imgW,
    y: (startRow * cellH) / imgH,
    w: ((endCol - startCol) * cellW) / imgW,
    h: ((endRow - startRow) * cellH) / imgH,
  };
}

// Comentario: aplica crop 3x4 com os parâmetros calibrados.
// Recebe pixels RGBA e retorna as coordenadas do recorte.
function aplicarCrop3x4(
  pixels: Uint8Array,
  imgW: number,
  imgH: number,
  face: { x: number; y: number; w: number; h: number }
): { cropX: number; cropY: number; cropW: number; cropH: number } {
  // Dimensões absolutas do rosto detectado
  const faceW = face.w * imgW;
  const faceH = face.h * imgH;
  const faceCX = (face.x + face.w / 2) * imgW;
  const faceCY = (face.y + face.h / 2) * imgH + CY_OFFSET * faceH;

  // Largura e altura do crop baseadas no rosto
  const cropW = faceW * (1 + 2 * PAD_SIDES);
  const cropH = faceH * CROP_H;

  // Posição do crop centralizada no rosto
  const cropX = Math.round(faceCX - cropW / 2);
  const cropY = Math.round(faceCY - PAD_TOP * faceH - faceH * 0.5);

  // Limitar aos limites da imagem
  const clampX = Math.max(0, Math.min(cropX, imgW - 1));
  const clampY = Math.max(0, Math.min(cropY, imgH - 1));
  const clampW = Math.min(cropW, imgW - clampX);
  const clampH = Math.min(cropH, imgH - clampY);

  return {
    cropX: Math.round(clampX),
    cropY: Math.round(clampY),
    cropW: Math.round(clampW),
    cropH: Math.round(clampH),
  };
}

async function handleUploadPhoto(
  body: { obreiroId?: string; imageBase64?: string; mimeType?: string }
): Promise<Response> {
  const { obreiroId, imageBase64, mimeType } = body;

  // Comentario: obreiroId e imageBase64 são obrigatórios para o upload.
  if (!obreiroId || !imageBase64) {
    return json({ error: "obreiroId e imageBase64 são obrigatórios" }, 400);
  }

  try {
    // ---- Passo 1: Decodificar a imagem base64 ----
    // Remove o prefixo "data:image/jpeg;base64," se existir
    const base64Puro = imageBase64.replace(/^data:[^;]+;base64,/, "");
    const bytesImagem = Uint8Array.from(atob(base64Puro), (c) => c.charCodeAt(0));

    // ---- Passo 2: Tentar enviar para o Cloudflare Worker (remoção de fundo) ----
    // Nota: Como Deno Edge não tem Canvas API nativa, usamos uma abordagem
    // de detecção por luminância na grade 8x8 e enviamos para o CF Worker
    // com a imagem original. O CF Worker aplica o crop na imagem completa.
    // O crop foi feito no frontend via face-api.js.
    const cfWorkerUrl = Deno.env.get("CF_WORKER_URL");

    let imagemFinal: string;
    let mimeTypeFinal = "image/jpeg";

    if (cfWorkerUrl) {
      // ---- Passo 3: Chamar o Cloudflare Worker para remover o fundo ----
      const cfResponse = await fetch(cfWorkerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: imageBase64,
          mimeType: mimeType || "image/jpeg",
        }),
      });

      if (cfResponse.ok) {
        const cfData = await cfResponse.json() as { imageBase64: string; mimeType: string };
        imagemFinal = cfData.imageBase64.replace(/^data:[^;]+;base64,/, "");
        mimeTypeFinal = "image/png"; // resultado do rembg é sempre PNG
      } else {
        // Se o CF Worker falhar, usar imagem original
        console.warn("CF Worker falhou, usando imagem original");
        imagemFinal = base64Puro;
      }
    } else {
      // Sem CF Worker configurado, usar imagem original
      imagemFinal = base64Puro;
    }

    // ---- Passo 4: Upload no Supabase Storage ----
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const ext = mimeTypeFinal === "image/png" ? "png" : "jpg";
    const storagePath = `avatars/users/${obreiroId}.${ext}`;
    const imageBytes = Uint8Array.from(atob(imagemFinal), (c) => c.charCodeAt(0));

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(storagePath, imageBytes, {
        contentType: mimeTypeFinal,
        upsert: true,
        cacheControl: "3600",
      });

    if (uploadError) {
      throw new Error(`Erro no upload: ${uploadError.message}`);
    }

    // Obter URL pública com cache-bust
    const { data: urlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(storagePath);

    const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    // ---- Passo 5: Atualizar avatar_url na tabela users ----
    const { error: updateError } = await supabase
      .from("users")
      .update({ avatar_url: avatarUrl })
      .eq("id", obreiroId);

    if (updateError) {
      // Não é crítico — a URL já está no storage
      console.warn("Aviso: não foi possível atualizar avatar_url:", updateError.message);
    }

    return json({ success: true, avatar_url: avatarUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: `Erro ao processar foto: ${msg}` }, 500);
  }
}

async function handleListMembers(session: SessionClaims, body: ListMembersBody): Promise<Response> {
  if (session.role === "obreiro") return json({ ok: false, error: "forbidden" }, 403);

  const page = Number.isFinite(body.page) ? Math.max(1, Number(body.page)) : 1;
  const page_size = Number.isFinite(body.page_size) ? Math.max(1, Math.min(1000, Number(body.page_size))) : 20;
  const roles = Array.isArray(body.roles) && body.roles.length ? body.roles : ["pastor", "obreiro"];
  const churchTotvsFilter = String(body.church_totvs_id || "").trim();

  const sb = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
  const { data: churches, error: churchesErr } = await sb.from("churches").select("totvs_id,parent_totvs_id,church_name,class");
  if (churchesErr) return json({ ok: false, error: "db_error_churches", details: churchesErr.message }, 500);

  const churchRows = (churches || []) as ChurchRow[];
  let scopeRootTotvs = session.active_totvs_id;
  let scope: Set<string>;
  if (session.role === "admin") {
    scope = new Set(churchRows.map((c) => String(c.totvs_id)).filter(Boolean));
    if (churchTotvsFilter && !scope.has(churchTotvsFilter)) return json({ ok: false, error: "church_not_found" }, 404);
  } else {
    scopeRootTotvs = await resolveScopeRootTotvs(sb, session);
    scope = computeScope(scopeRootTotvs, churchRows);
    if (churchTotvsFilter && !scope.has(churchTotvsFilter)) {
      return json({ ok: false, error: "forbidden_church_out_of_scope" }, 403);
    }
  }

  const sessionChurchClass = normalizeChurchClass(churchRows.find((c) => c.totvs_id === scopeRootTotvs)?.class);
  const churchMap = new Map(churchRows.map((c) => [String(c.totvs_id), c]));

  let q = sb
    .from("users")
    .select(
      "id,full_name,role,cpf,rg,phone,email,profession,minister_role,birth_date,baptism_date,marital_status,matricula,ordination_date,avatar_url,signature_url,cep,address_street,address_number,address_complement,address_neighborhood,address_city,address_state,default_totvs_id,totvs_access,is_active,can_create_released_letter,payment_status,payment_block_reason",
      { count: "exact" },
    )
    .in("role", roles)
    .order("full_name", { ascending: true });

  if (typeof body.is_active === "boolean") q = q.eq("is_active", body.is_active);
  if (body.search) {
    const safe = String(body.search).replace(/"/g, "").trim();
    if (safe) q = q.or(`full_name.ilike.%${safe}%,cpf.ilike.%${safe}%,phone.ilike.%${safe}%`);
  }

  const { data: users, error: usersErr } = await q;
  if (usersErr) return json({ ok: false, error: "db_error_users", details: usersErr.message }, 500);

  const normalizedRoleFilter = body.minister_role ? normalizeMinisterRole(body.minister_role) : null;
  const filtered = (users || []).filter((u: Record<string, unknown>) => {
    const defaultTotvs = String(u.default_totvs_id || "").trim();
    if (!defaultTotvs) return false;
    if (!scope.has(defaultTotvs)) return false;
    if (churchTotvsFilter && defaultTotvs !== churchTotvsFilter) return false;
    if (normalizedRoleFilter && normalizeMinisterRole(u.minister_role) !== normalizedRoleFilter) return false;
    return true;
  });

  const mapped = filtered.map((u: Record<string, unknown>) => {
    const defaultTotvs = String(u.default_totvs_id || "").trim();
    const churchName = String(churchMap.get(defaultTotvs)?.church_name || "").trim();
    const targetClass = normalizeChurchClass(churchMap.get(defaultTotvs)?.class);
    const can_manage = canManageMember(
      session.role,
      scopeRootTotvs,
      defaultTotvs,
      sessionChurchClass,
      targetClass,
      scope,
    );
    return { ...u, can_manage, church_name: churchName || null };
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

    if (attendanceErr) return json({ ok: false, error: "db_error_attendance", details: attendanceErr.message }, 500);

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
  const metrics = { total, pastor: 0, presbitero: 0, diacono: 0, obreiro: 0, membro: 0 };
  for (const member of mapped as Array<Record<string, unknown>>) {
    const role = normalizeMinisterRole(member.minister_role);
    if (role === "pastor") metrics.pastor += 1;
    else if (role === "presbitero") metrics.presbitero += 1;
    else if (role === "diacono") metrics.diacono += 1;
    else if (role === "membro") metrics.membro += 1;
    else if (role === "obreiro" || role === "cooperador" || role === "obreiro cooperador") metrics.obreiro += 1;
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
}

async function handleListWorkers(session: SessionClaims, body: ListWorkersBody): Promise<Response> {
  const roles: Array<"pastor" | "obreiro" | "secretario" | "financeiro"> = body.include_pastor ? ["pastor", "obreiro"] : ["obreiro"];
  const response = await handleListMembers(session, {
    search: body.search,
    minister_role: body.minister_role,
    is_active: body.is_active,
    roles,
    page: body.page,
    page_size: body.page_size,
  });
  const raw = (await response.clone().json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) return response;
  return json({
    ok: true,
    workers: Array.isArray(raw.members) ? raw.members : [],
    total: Number(raw.total || 0),
    page: Number(raw.page || body.page || 1),
    page_size: Number(raw.page_size || body.page_size || 20),
  }, 200);
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrada principal — roteamento por campo "action"
// ─────────────────────────────────────────────────────────────────────────────


async function handleChangeMemberChurch(session: SessionClaims, body: ChangeMemberChurchBody): Promise<Response> {
  if (session.role !== "admin" && session.role !== "pastor") return json({ ok: false, error: "forbidden" }, 403);

  const userId = String(body.user_id || "").trim();
  const targetTotvsId = String(body.target_totvs_id || "").trim();
  if (!userId) return json({ ok: false, error: "missing_user_id" }, 400);
  if (!targetTotvsId) return json({ ok: false, error: "missing_target_totvs_id" }, 400);
  if (userId === session.user_id) return json({ ok: false, error: "cannot_change_self" }, 403);

  const sb = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

  const { data: targetUser, error: targetErr } = await sb
    .from("users")
    .select("id, role, full_name, default_totvs_id")
    .eq("id", userId)
    .maybeSingle();
  if (targetErr) return json({ ok: false, error: "db_error_target_user", details: targetErr.message }, 500);
  if (!targetUser) return json({ ok: false, error: "target_user_not_found" }, 404);

  const currentRole = String((targetUser as Record<string, unknown>).role || "").toLowerCase();
  if (currentRole === "pastor") return json({ ok: false, error: "pastor_change_requires_set_pastor" }, 409);
  if (currentRole === "admin") return json({ ok: false, error: "cannot_change_admin_user" }, 403);

  const currentTotvs = String((targetUser as Record<string, unknown>).default_totvs_id || "").trim();
  if (currentTotvs === targetTotvsId) return json({ ok: true, unchanged: true }, 200);

  const { data: churches, error: churchesErr } = await sb.from("churches").select("totvs_id,parent_totvs_id,class");
  if (churchesErr) return json({ ok: false, error: "db_error_churches", details: churchesErr.message }, 500);

  const churchRows = (churches || []) as ChurchRow[];
  const churchSet = new Set(churchRows.map((church) => String(church.totvs_id)));
  if (!churchSet.has(targetTotvsId)) return json({ ok: false, error: "target_church_not_found" }, 404);

  let scopeRootTotvs = session.active_totvs_id;
  let scope: Set<string>;
  if (session.role === "admin") {
    scope = churchSet;
  } else {
    scopeRootTotvs = await resolveScopeRootTotvs(sb, session);
    scope = computeScope(scopeRootTotvs, churchRows);
    if (!currentTotvs || !scope.has(currentTotvs)) return json({ ok: false, error: "forbidden_member_out_of_scope" }, 403);
    if (!scope.has(targetTotvsId)) return json({ ok: false, error: "forbidden_target_out_of_scope" }, 403);

    const sessionChurchClass = normalizeChurchClass(churchRows.find((church) => church.totvs_id === scopeRootTotvs)?.class);
    const memberChurchClass = normalizeChurchClass(churchRows.find((church) => church.totvs_id === currentTotvs)?.class);
    const canManage = canManageMember(session.role, scopeRootTotvs, currentTotvs, sessionChurchClass, memberChurchClass, scope);
    if (!canManage) return json({ ok: false, error: "forbidden_member_not_manageable" }, 403);
  }

  const accessRole: Role = currentRole === "secretario" || currentRole === "financeiro" ? (currentRole as Role) : "obreiro";
  const { error: updateErr } = await sb
    .from("users")
    .update({
      default_totvs_id: targetTotvsId,
      totvs_access: [{ totvs_id: targetTotvsId, role: accessRole }],
    })
    .eq("id", userId);
  if (updateErr) return json({ ok: false, error: "db_error_change_member_church", details: updateErr.message }, 500);

  return json({
    ok: true,
    user_id: userId,
    full_name: String((targetUser as Record<string, unknown>).full_name || ""),
    from_totvs_id: currentTotvs || null,
    to_totvs_id: targetTotvsId,
  }, 200);
}

async function handleChangeMemberAccess(session: SessionClaims, body: ChangeMemberAccessBody): Promise<Response> {
  if (session.role !== "admin" && session.role !== "pastor") return json({ ok: false, error: "forbidden" }, 403);

  const userId = String(body.user_id || "").trim();
  const nextRole = String(body.role || "").toLowerCase().trim() as Role;
  if (!userId) return json({ ok: false, error: "missing_user_id" }, 400);
  if (!["obreiro", "secretario", "financeiro"].includes(nextRole)) {
    return json({ ok: false, error: "invalid_target_role" }, 400);
  }
  if (userId === session.user_id) return json({ ok: false, error: "cannot_change_self" }, 403);

  const sb = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

  const { data: targetUser, error: targetErr } = await sb
    .from("users")
    .select("id, role, full_name, default_totvs_id, totvs_access")
    .eq("id", userId)
    .maybeSingle();
  if (targetErr) return json({ ok: false, error: "db_error_target_user", details: targetErr.message }, 500);
  if (!targetUser) return json({ ok: false, error: "target_user_not_found" }, 404);

  const currentRole = String((targetUser as Record<string, unknown>).role || "").toLowerCase();
  if (currentRole === "pastor") return json({ ok: false, error: "pastor_change_requires_set_pastor" }, 409);
  if (currentRole === "admin") return json({ ok: false, error: "cannot_change_admin_user" }, 403);
  if (currentRole === nextRole) return json({ ok: true, unchanged: true }, 200);

  const currentTotvs = String((targetUser as Record<string, unknown>).default_totvs_id || "").trim();
  if (!currentTotvs) return json({ ok: false, error: "target_user_without_church" }, 409);

  const { data: churches, error: churchesErr } = await sb.from("churches").select("totvs_id,parent_totvs_id,class");
  if (churchesErr) return json({ ok: false, error: "db_error_churches", details: churchesErr.message }, 500);
  const churchRows = (churches || []) as ChurchRow[];

  if (session.role !== "admin") {
    const scopeRootTotvs = await resolveScopeRootTotvs(sb, session);
    const scope = computeScope(scopeRootTotvs, churchRows);
    if (!scope.has(currentTotvs)) return json({ ok: false, error: "forbidden_member_out_of_scope" }, 403);

    const sessionChurchClass = normalizeChurchClass(churchRows.find((church) => church.totvs_id === scopeRootTotvs)?.class);
    const memberChurchClass = normalizeChurchClass(churchRows.find((church) => church.totvs_id === currentTotvs)?.class);
    const canManage = canManageMember(session.role, scopeRootTotvs, currentTotvs, sessionChurchClass, memberChurchClass, scope);
    if (!canManage) return json({ ok: false, error: "forbidden_member_not_manageable" }, 403);
  }

  const currentAccess = normalizeTotvsAccess((targetUser as Record<string, unknown>).totvs_access, nextRole);
  const nextAccess = currentAccess.length > 0
    ? currentAccess.map((access) => ({ ...access, role: nextRole }))
    : [{ totvs_id: currentTotvs, role: nextRole }];

  const { error: updateErr } = await sb
    .from("users")
    .update({
      role: nextRole,
      totvs_access: nextAccess,
    })
    .eq("id", userId);
  if (updateErr) return json({ ok: false, error: "db_error_change_member_access", details: updateErr.message }, 500);

  return json({
    ok: true,
    user_id: userId,
    full_name: String((targetUser as Record<string, unknown>).full_name || ""),
    from_role: currentRole,
    to_role: nextRole,
  }, 200);
}

Deno.serve(async (req) => {
  // Comentario: responde ao preflight do CORS sem processar nada.
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    // Comentario: lê o body uma única vez — todas as actions recebem JSON.
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "").trim();

    // Comentario: verifica autenticação — válida para todas as actions.
    // A action "save" também aceita x-admin-key como alternativa ao JWT.
    const adminKey = Deno.env.get("ADMIN_KEY") || "";
    const adminHeader = req.headers.get("x-admin-key") || "";
    const isAdminByKey = Boolean(adminKey && adminHeader && adminHeader === adminKey);
    const session = isAdminByKey ? null : await verifySessionJWT(req);

    switch (action) {
      // ── action: "save" ───────────────────────────────────────────────────
      case "save": {
        // Comentario: somente admin (por chave ou JWT) e pastor podem salvar usuários.
        // Obreiros não têm permissão.
        if (!isAdminByKey && !session) return json({ ok: false, error: "unauthorized" }, 401);
        if (!isAdminByKey && session?.role === "obreiro") {
          return json({ ok: false, error: "forbidden" }, 403);
        }
        return await handleSave(req, body as SaveBody, isAdminByKey, session);
      }

      // ── action: "save-profile" ───────────────────────────────────────────
      case "save-profile": {
        // Comentario: qualquer usuário autenticado pode atualizar o próprio perfil.
        if (!session) return json({ ok: false, error: "unauthorized" }, 401);
        return await handleSaveProfile(session, body as SaveProfileBody);
      }

      // ── action: "get-profile" ────────────────────────────────────────────
      case "get-profile": {
        // Comentario: qualquer usuário autenticado pode consultar o próprio perfil.
        if (!session) return json({ ok: false, error: "unauthorized" }, 401);
        return await handleGetProfile(session);
      }

      case "update-avatar": {
        return await handleUpdateAvatar(body as UpdateAvatarBody);
      }

      case "upsert-stamps": {
        if (!session) return json({ ok: false, error: "unauthorized" }, 401);
        return await handleUpsertStamps(session, body as UpsertStampsBody);
      }

      // ── action: "upload-photo" ───────────────────────────────────────────
      case "upload-photo": {
        // Comentario: qualquer usuário autenticado pode fazer upload de foto.
        if (!isAdminByKey && !session) return json({ ok: false, error: "unauthorized" }, 401);
        return await handleUploadPhoto(
          body as { obreiroId?: string; imageBase64?: string; mimeType?: string }
        );
      }

      case "list-members": {
        if (!session) return json({ ok: false, error: "unauthorized" }, 401);
        return await handleListMembers(session, body as ListMembersBody);
      }

      case "list-workers": {
        if (!session) return json({ ok: false, error: "unauthorized" }, 401);
        return await handleListWorkers(session, body as ListWorkersBody);
      }

      case "change-member-church": {
        if (!session) return json({ ok: false, error: "unauthorized" }, 401);
        return await handleChangeMemberChurch(session, body as ChangeMemberChurchBody);
      }

      case "change-member-access": {
        if (!session) return json({ ok: false, error: "unauthorized" }, 401);
        return await handleChangeMemberAccess(session, body as ChangeMemberAccessBody);
      }

      default:
        return json({ ok: false, error: "unknown_action" }, 400);
    }
  } catch (err) {
    return json({ ok: false, error: "exception" }, 500);
  }
});
