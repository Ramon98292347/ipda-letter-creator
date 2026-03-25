/**
 * auth-api
 * ========
 * O que faz: Consolida o modulo de autenticacao e cadastro publico do sistema.
 *            Roteia as chamadas pelo campo "action" no body da requisicao.
 * Para que serve: Reduz a manutencao de functions soltas como login, select-church,
 *                 forgot-password-request, reset-password-confirm,
 *                 public-register-member, get-my-registration-status e get-pastor-contact.
 * Quem pode usar: publico ou autenticado, dependendo da action.
 * Recebe: { action: string, ...campos da action }
 * Retorna: o mesmo contrato das functions antigas correspondentes.
 * Observacoes: Deve ser publicada com verify_jwt = false no config.toml
 *              e continua validando o JWT customizado manualmente quando necessario.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";
import { jwtVerify, SignJWT } from "https://esm.sh/jose@5.2.4";

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

function onlyDigits(value: string) {
  return String(value || "").replace(/\D+/g, "");
}

function normalizeEmail(value: string | null | undefined) {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}

function normalizePhone(value: string | null | undefined) {
  const phone = onlyDigits(value || "");
  return phone || null;
}

function isValidCpf(value: string) {
  const cpf = onlyDigits(value || "");

  if (cpf.length !== 11) return false;
  return !/^(\d)\1{10}$/.test(cpf);
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashToken(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(digest);
}

function generateToken() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

type Role = "admin" | "pastor" | "obreiro" | "secretario" | "financeiro";
type SessionClaims = {
  user_id: string;
  role: Role;
  active_totvs_id: string;
};
type ChurchRow = { totvs_id: string; parent_totvs_id: string | null };
type TotvsAccessItem = string | { totvs_id?: string; role?: string };

function createAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );
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
    if (!["admin", "pastor", "obreiro", "secretario", "financeiro"].includes(role)) return null;

    return { user_id, role, active_totvs_id };
  } catch {
    return null;
  }
}

function normalizeTotvsAccess(arr: unknown, defaultRole: string): { totvs_id: string; role: string }[] {
  const out: { totvs_id: string; role: string }[] = [];
  if (!Array.isArray(arr)) return out;

  const allowed = new Set(["admin", "pastor", "obreiro", "secretario", "financeiro"]);
  const safeDefault = allowed.has(defaultRole) ? defaultRole : "obreiro";

  for (const item of arr as TotvsAccessItem[]) {
    if (typeof item === "string") {
      const totvsId = item.trim();
      if (totvsId) out.push({ totvs_id: totvsId, role: safeDefault });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const totvsId = String(item.totvs_id || "").trim();
    const roleRaw = String(item.role || safeDefault).trim().toLowerCase();
    const role = allowed.has(roleRaw) ? roleRaw : safeDefault;
    if (totvsId) out.push({ totvs_id: totvsId, role });
  }

  const uniq = new Map<string, { totvs_id: string; role: string }>();
  for (const item of out) uniq.set(item.totvs_id, item);
  return [...uniq.values()];
}

function computeScope(rootTotvs: string, churches: ChurchRow[]): string[] {
  const children = new Map<string, string[]>();
  for (const church of churches) {
    const parent = church.parent_totvs_id || "";
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
  return [...scope];
}

function computeRootTotvs(activeTotvs: string, churches: ChurchRow[]): string {
  const parentById = new Map<string, string | null>();
  for (const church of churches) {
    parentById.set(String(church.totvs_id), church.parent_totvs_id ? String(church.parent_totvs_id) : null);
  }

  let current = activeTotvs;
  const visited = new Set<string>();
  while (visited.size < 100) {
    if (visited.has(current)) return activeTotvs;
    visited.add(current);
    const parent = parentById.get(current) ?? null;
    if (!parent) return current;
    current = parent;
  }
  return activeTotvs;
}

async function signAppToken(payload: { sub: string; app_role: string; active_totvs_id: string }) {
  const secret = Deno.env.get("USER_SESSION_JWT_SECRET") || "";
  if (!secret) return null;
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    role: payload.app_role,
    app_role: payload.app_role,
    active_totvs_id: payload.active_totvs_id,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 60 * 12)
    .sign(new TextEncoder().encode(secret));
}

async function signRlsToken(payload: { sub: string; app_role: string; active_totvs_id: string; scope_totvs_ids: string[]; root_totvs_id: string }) {
  const secret = Deno.env.get("APP_RLS_JWT_SECRET") || "";
  if (!secret) return null;
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    role: "authenticated",
    app_role: payload.app_role,
    active_totvs_id: payload.active_totvs_id,
    scope_totvs_ids: payload.scope_totvs_ids,
    root_totvs_id: payload.root_totvs_id,
    aud: "authenticated",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 60 * 12)
    .sign(new TextEncoder().encode(secret));
}

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MINUTES = 15;

async function checkRateLimitDB(
  sb: ReturnType<typeof createClient>,
  cpf: string,
  ip: string,
): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();

  const { count } = await sb
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("cpf", cpf)
    .eq("success", false)
    .gte("created_at", windowStart);

  if ((count ?? 0) >= RATE_LIMIT_MAX) return false;

  await sb.from("login_attempts").insert({ cpf, ip, success: false });
  return true;
}

async function markLoginSuccess(
  sb: ReturnType<typeof createClient>,
  cpf: string,
): Promise<void> {
  await sb
    .from("login_attempts")
    .update({ success: true })
    .eq("cpf", cpf)
    .eq("success", false)
    .order("created_at", { ascending: false })
    .limit(1);
}

function normalizeMinisterRole(value: string | null | undefined) {
  // Comentario: remove acentos e normaliza para minusculo para aceitar
  // tanto "Diácono" quanto "diacono", "Presbítero" quanto "presbitero", etc.
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const map: Record<string, string> = {
    membro: "Membro",
    obreiro: "Obreiro",
    // Comentario: usa os valores COM acento para bater com o CHECK constraint users_minister_role_check do banco
    diacono: "Diácono",
    presbitero: "Presbítero",
    pastor: "Pastor",
    cooperador: "Cooperador",
    voluntario: "Voluntario",
  };
  return map[raw] || null;
}

function resolveStatus(totvsAccess: unknown, activeTotvsId: string, fallbackMinisterRole: string) {
  if (Array.isArray(totvsAccess)) {
    for (const item of totvsAccess) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const entryTotvs = String(entry.totvs_id || "").trim();
      if (entryTotvs && entryTotvs !== activeTotvsId) continue;
      const status = String(entry.registration_status || "").trim().toUpperCase();
      if (status === "PENDENTE" || status === "APROVADO") return status;
    }
  }

  const ministerRole = String(fallbackMinisterRole || "").toUpperCase();
  if (ministerRole.includes("PENDENTE")) return "PENDENTE";
  return "APROVADO";
}

async function handleLogin(req: Request, body: Record<string, unknown>) {
  const cpf = onlyDigits(String(body.cpf || ""));
  const password = String(body.password || "");
  if (!isValidCpf(cpf)) return json({ ok: false, error: "invalid_cpf" }, 400);
  if (!password) return json({ ok: false, error: "missing_password" }, 400);

  const sb = createAdminClient();
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const allowed = await checkRateLimitDB(sb, cpf, clientIp);
  if (!allowed) {
    return json(
      { ok: false, error: "rate_limit_exceeded", message: "Muitas tentativas de login. Aguarde 15 minutos e tente novamente." },
      429,
    );
  }

  const { data: user, error: userError } = await sb
    .from("users")
    .select("id, cpf, full_name, role, password_hash, is_active, totvs_access, default_totvs_id, payment_status, discipline_status, discipline_block_reason")
    .eq("cpf", cpf)
    .maybeSingle();

  if (userError) return json({ ok: false, error: "db_error" }, 500);
  // Comentario: retorna user_not_found (nao invalid-credentials) para o front saber abrir o cadastro rapido
  if (!user) return json({ ok: false, error: "user_not_found" }, 401);
  if (!user.is_active) {
    // Comentario: se inativo por cadastro pendente, informa mensagem especifica
    const rawAccess = Array.isArray(user.totvs_access) ? user.totvs_access as Record<string, unknown>[] : [];
    const hasPending = rawAccess.some((item) => String(item?.registration_status || "").trim().toUpperCase() === "PENDENTE");
    if (hasPending) return json({ ok: false, error: "registration_pending", message: "Seu cadastro está pendente de aprovação. Aguarde a liberação do pastor da sua igreja." }, 403);
    return json({ ok: false, error: "inactive_user" }, 403);
  }

  if (String(user.payment_status || "").toUpperCase() === "BLOQUEADO_PAGAMENTO") {
    return json({ ok: false, error: "blocked_payment", message: "Acesso bloqueado por pagamento pendente." }, 403);
  }
  if (String(user.discipline_status || "").toUpperCase() === "BLOQUEADO_DISCIPLINA") {
    return json({
      ok: false,
      error: "blocked_discipline",
      message: String(user.discipline_block_reason || "Acesso bloqueado por faltas sem justificativa em reunioes ministeriais."),
    }, 403);
  }

  const userRole = String(user.role || "obreiro").toLowerCase();
  const currentHash = user.password_hash ? String(user.password_hash) : "";
  if (!currentHash) {
    const newHash = bcrypt.hashSync(password, 10);
    const { error: setError } = await sb.from("users").update({ password_hash: newHash }).eq("id", user.id);
    if (setError) return json({ ok: false, error: "set_password_failed" }, 500);
  } else {
    const passwordOk = bcrypt.compareSync(password, currentHash);
    if (!passwordOk) return json({ ok: false, error: "invalid-credentials" }, 401);
  }

  await markLoginSuccess(sb, cpf);

  let access = normalizeTotvsAccess(user.totvs_access, userRole);
  if (access.length === 0) {
    const fallbackTotvs = String(user.default_totvs_id || "").trim();
    if (fallbackTotvs) {
      access = [{ totvs_id: fallbackTotvs, role: userRole }];
      await sb.from("users").update({ totvs_access: access }).eq("id", user.id);
    }
  }

  if (access.length === 0 && userRole === "admin") {
    const { data: allChurches, error: allError } = await sb
      .from("churches")
      .select("totvs_id")
      .order("totvs_id", { ascending: true });
    if (allError) return json({ ok: false, error: "db_error" }, 500);
    const ids = (allChurches || []).map((item) => String(item.totvs_id || "")).filter(Boolean);
    access = ids.map((totvsId) => ({ totvs_id: totvsId, role: "admin" }));
    if (ids.length > 0) await sb.from("users").update({ totvs_access: access }).eq("id", user.id);
  }

  if (access.length === 0) {
    return json({ ok: false, error: "no_totvs_access", message: "Usuario sem acesso de igreja." }, 403);
  }

  const totvsIds = access.map((item) => item.totvs_id);
  const { data: churchesMeta, error: churchesMetaError } = await sb
    .from("churches")
    .select("totvs_id, church_name, class, parent_totvs_id")
    .in("totvs_id", totvsIds);
  if (churchesMetaError) return json({ ok: false, error: "db_error" }, 500);

  const metaByTotvs = new Map<string, Record<string, unknown>>();
  for (const church of churchesMeta || []) metaByTotvs.set(String(church.totvs_id), church as Record<string, unknown>);

  const churchesForUI = access.map((item) => {
    const meta = metaByTotvs.get(item.totvs_id);
    return {
      totvs_id: item.totvs_id,
      role: item.role,
      church_name: String(meta?.church_name || ""),
      church_class: String(meta?.class || ""),
    };
  });

  const defaultTotvs = String(user.default_totvs_id || "").trim();
  const defaultAllowed = defaultTotvs && totvsIds.includes(defaultTotvs) ? defaultTotvs : "";
  const pastorAccess = access.filter((item) => item.role === "pastor" || item.role === "secretario").map((item) => item.totvs_id);

  let activeTotvs = "";
  if (userRole === "pastor" || userRole === "secretario") {
    if (defaultAllowed && pastorAccess.includes(defaultAllowed)) activeTotvs = defaultAllowed;
    else if (pastorAccess.length === 1) activeTotvs = pastorAccess[0];
    else if (defaultAllowed) activeTotvs = defaultAllowed;
    else if (churchesForUI.length === 1) activeTotvs = churchesForUI[0].totvs_id;
  } else if (userRole === "admin") {
    activeTotvs = defaultAllowed || (churchesForUI.length > 0 ? churchesForUI[0].totvs_id : "");
  } else {
    activeTotvs = defaultAllowed || (churchesForUI.length === 1 ? churchesForUI[0].totvs_id : "");
  }

  if (!activeTotvs) {
    return json({
      ok: true,
      mode: "select_church",
      cpf: user.cpf,
      user: { id: user.id, full_name: user.full_name, cpf: user.cpf, role: user.role },
      churches: churchesForUI,
    }, 200);
  }

  // Comentario: bloqueia login se o cadastro estiver PENDENTE de aprovacao do pastor.
  // Obreiros recem-cadastrados nascem com registration_status PENDENTE e so acessam
  // apos o pastor aprovar. Admin e pastor nunca sao bloqueados por este check.
  if (userRole === "obreiro") {
    const rawAccess = Array.isArray(user.totvs_access) ? user.totvs_access as Record<string, unknown>[] : [];
    const activeEntry = rawAccess.find((item) => String(item?.totvs_id || "").trim() === activeTotvs);
    const regStatus = String(activeEntry?.registration_status || "APROVADO").trim().toUpperCase();
    if (regStatus === "PENDENTE") {
      return json({
        ok: false,
        error: "registration_pending",
        message: "Seu cadastro está pendente de aprovação. Aguarde a liberação do pastor da sua igreja.",
      }, 403);
    }
  }

  const { data: allChurches, error: allChurchesError } = await sb.from("churches").select("totvs_id, parent_totvs_id");
  if (allChurchesError) return json({ ok: false, error: "db_error" }, 500);
  const all = (allChurches || []) as ChurchRow[];
  const scope_totvs_ids = userRole === "admin"
    ? all.map((church) => String(church.totvs_id || "")).filter(Boolean)
    : computeScope(activeTotvs, all);
  const root_totvs_id = computeRootTotvs(activeTotvs, all);
  const activeMeta = metaByTotvs.get(activeTotvs);

  const token = await signAppToken({ sub: String(user.id), app_role: userRole, active_totvs_id: activeTotvs });
  if (!token) return json({ ok: false, error: "missing_app_jwt_secret" }, 500);

  const rls_token = await signRlsToken({
    sub: String(user.id),
    app_role: userRole,
    active_totvs_id: activeTotvs,
    scope_totvs_ids,
    root_totvs_id,
  });

  return json({
    ok: true,
    mode: "logged_in",
    token,
    rls_token,
    user: { id: user.id, full_name: user.full_name, cpf: user.cpf, role: user.role },
    session: {
      totvs_id: activeTotvs,
      church_name: String(activeMeta?.church_name || ""),
      church_class: String(activeMeta?.class || ""),
      scope_totvs_ids,
      root_totvs_id,
    },
  }, 200);
}

async function handleSelectChurch(body: Record<string, unknown>) {
  const cpf = onlyDigits(String(body.cpf || ""));
  const totvs_id = String(body.totvs_id || "").trim();
  if (!isValidCpf(cpf)) return json({ ok: false, error: "invalid_cpf" }, 400);
  if (!totvs_id) return json({ ok: false, error: "missing_totvs_id" }, 400);

  const sb = createAdminClient();
  const { data: user, error: userError } = await sb
    .from("users")
    .select("id, cpf, full_name, role, is_active, totvs_access")
    .eq("cpf", cpf)
    .maybeSingle();
  if (userError) return json({ ok: false, error: "db_error_user", details: userError.message }, 500);
  if (!user) return json({ ok: false, error: "user_not_found" }, 404);
  if (!user.is_active) return json({ ok: false, error: "inactive_user" }, 403);

  const userRole = String(user.role || "obreiro").toLowerCase();
  const access = normalizeTotvsAccess(user.totvs_access, userRole);
  const allowed = access.map((item) => item.totvs_id);
  if (!allowed.includes(totvs_id)) return json({ ok: false, error: "forbidden_totvs" }, 403);

  const { data: activeMeta, error: churchError } = await sb
    .from("churches")
    .select("totvs_id, church_name, class")
    .eq("totvs_id", totvs_id)
    .maybeSingle();
  if (churchError) return json({ ok: false, error: "db_error_church", details: churchError.message }, 500);

  const { data: allChurches, error: scopeError } = await sb.from("churches").select("totvs_id,parent_totvs_id");
  if (scopeError) return json({ ok: false, error: "db_error_scope", details: scopeError.message }, 500);

  const all = (allChurches || []) as ChurchRow[];
  const scope_totvs_ids = userRole === "admin"
    ? all.map((church) => String(church.totvs_id || "")).filter(Boolean)
    : computeScope(totvs_id, all);
  const root_totvs_id = computeRootTotvs(totvs_id, all);

  const token = await signAppToken({ sub: String(user.id), app_role: userRole, active_totvs_id: totvs_id });
  if (!token) return json({ ok: false, error: "missing_app_jwt_secret" }, 500);

  const rls_token = await signRlsToken({
    sub: String(user.id),
    app_role: userRole,
    active_totvs_id: totvs_id,
    scope_totvs_ids,
    root_totvs_id,
  });

  return json({
    ok: true,
    mode: "logged_in",
    token,
    rls_token,
    user: { id: user.id, full_name: user.full_name, cpf: user.cpf, role: user.role },
    session: {
      totvs_id,
      church_name: String((activeMeta as Record<string, unknown> | null)?.church_name || ""),
      church_class: String((activeMeta as Record<string, unknown> | null)?.class || ""),
      scope_totvs_ids,
      root_totvs_id,
    },
  }, 200);
}

async function handleForgotPassword(req: Request, body: Record<string, unknown>) {
  const cpf = onlyDigits(String(body.cpf || ""));
  const email = String(normalizeEmail(String(body.email || "")) || "");
  if (cpf.length !== 11 && !email) {
    return json({ ok: false, error: "missing_identifier", detail: "Informe CPF ou e-mail." }, 400);
  }

  const sb = createAdminClient();
  let query = sb
    .from("users")
    .select("id, full_name, cpf, email, phone, default_totvs_id, role, is_active")
    .limit(1);

  if (cpf.length === 11) query = query.eq("cpf", cpf);
  else query = query.ilike("email", email);

  const { data: user, error } = await query.maybeSingle();
  if (error) return json({ ok: false, error: "db_error_user", details: error.message }, 500);

  const response = {
    ok: true,
    message: "Se existir cadastro, voce recebera as orientacoes de recuperacao.",
  };

  if (!user) return json(response, 200);

  const token = generateToken();
  const token_hash = await hashToken(token);
  const expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { data: resetRow, error: resetErr } = await sb
    .from("password_resets")
    .insert({
      user_id: user.id,
      token_hash,
      expires_at,
      request_ip:
        req.headers.get("x-forwarded-for") ||
        req.headers.get("x-real-ip") ||
        null,
    })
    .select("id")
    .single();

  if (resetErr) return json({ ok: false, error: "db_error_password_reset", details: resetErr.message }, 500);

  const appBaseUrl = (Deno.env.get("APP_BASE_URL") || "http://localhost:5175").replace(/\/$/, "");
  const resetUrl = `${appBaseUrl}/reset-senha?token=${encodeURIComponent(token)}`;

  const webhookUrl = Deno.env.get("N8N_FORGOT_PASSWORD_WEBHOOK_URL")
    || "https://n8n-n8n.ynlng8.easypanel.host/webhook/senha";

  const payload = {
    action: "forgot_password_request",
    requested_at: new Date().toISOString(),
    reset: {
      request_id: resetRow?.id || null,
      expires_at,
      reset_url: resetUrl,
    },
    user: {
      id: user.id,
      full_name: user.full_name,
      cpf: user.cpf,
      email: user.email,
      phone: user.phone,
      role: user.role,
      default_totvs_id: user.default_totvs_id,
      is_active: user.is_active,
    },
    search: {
      cpf: cpf || null,
      email: email || null,
    },
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Comentario: falha no webhook nao bloqueia o usuario final.
  }

  return json(response, 200);
}

async function handleResetPassword(body: Record<string, unknown>) {
  const token = String(body.token || "").trim();
  const newPassword = String(body.new_password || "");
  if (!token) return json({ ok: false, error: "missing_token" }, 400);
  if (newPassword.length < 6) {
    return json({ ok: false, error: "password_too_short", detail: "A senha precisa ter pelo menos 6 caracteres." }, 400);
  }

  const sb = createAdminClient();
  const tokenHash = await hashToken(token);
  const { data: resetRows, error: resetErr } = await sb
    .from("password_resets")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (resetErr) return json({ ok: false, error: "db_error_password_reset", details: resetErr.message }, 500);
  if (!resetRows || resetRows.length === 0) return json({ ok: false, error: "invalid_or_expired_token" }, 400);

  const resetRow = resetRows[0] as { id: string; user_id: string; expires_at: string };
  const expiresAt = new Date(String(resetRow.expires_at || ""));
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    return json({ ok: false, error: "invalid_or_expired_token" }, 400);
  }

  const password_hash = bcrypt.hashSync(newPassword, 10);

  const { error: userErr } = await sb
    .from("users")
    .update({ password_hash })
    .eq("id", resetRow.user_id);
  if (userErr) return json({ ok: false, error: "db_error_update_password", details: userErr.message }, 500);

  const { error: usedErr } = await sb
    .from("password_resets")
    .update({ used_at: new Date().toISOString() })
    .eq("id", resetRow.id);
  if (usedErr) return json({ ok: false, error: "db_error_mark_used", details: usedErr.message }, 500);

  return json({ ok: true, message: "Senha redefinida com sucesso." }, 200);
}

async function handleGetPastorContact(req: Request, body: Record<string, unknown>) {
  const session = await verifySessionJWT(req);
  if (!session) return json({ ok: false, error: "unauthorized" }, 401);

  const totvs = String(body.totvs_id || "").trim();
  if (!totvs) return json({ ok: false, error: "totvs_id_required" }, 400);

  const sb = createAdminClient();
  const { data: church } = await sb
    .from("churches")
    .select("pastor_user_id")
    .eq("totvs_id", totvs)
    .maybeSingle();

  if (!church?.pastor_user_id) {
    const { data: byTotvs } = await sb
      .from("users")
      .select("full_name, phone, email, avatar_url, minister_role, signature_url")
      .eq("role", "pastor")
      .eq("default_totvs_id", totvs)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!byTotvs) return json({ ok: true, pastor: null });
    return json({ ok: true, pastor: byTotvs });
  }

  const { data: pastor } = await sb
    .from("users")
    .select("full_name, phone, email, avatar_url, minister_role, signature_url")
    .eq("id", church.pastor_user_id)
    .eq("is_active", true)
    .maybeSingle();

  return json({ ok: true, pastor: pastor || null });
}

async function handlePublicRegister(body: Record<string, unknown>) {
  const cpf = onlyDigits(String(body.cpf || ""));
  const fullName = String(body.full_name || "").trim();
  const ministerRole = normalizeMinisterRole(String(body.minister_role || ""));
  const profession = String(body.profession || "").trim() || null;
  const baptismDate = String(body.baptism_date || "").trim() || null;
  const ordinationDate = String(body.ordination_date || "").trim() || null;
  const password = String(body.password || "");
  const totvsId = String(body.totvs_id || "").trim();
  const phone = normalizePhone(String(body.phone || ""));
  const email = normalizeEmail(String(body.email || ""));
  const avatarUrl = String(body.avatar_url || "").trim() || null;
  const cep = onlyDigits(String(body.cep || "")).slice(0, 8) || null;
  const addressStreet = String(body.address_street || "").trim() || null;
  const addressNumber = String(body.address_number || "").trim() || null;
  const addressComplement = String(body.address_complement || "").trim() || null;
  const addressNeighborhood = String(body.address_neighborhood || "").trim() || null;
  const addressCity = String(body.address_city || "").trim() || null;
  const addressState = String(body.address_state || "").trim().toUpperCase().slice(0, 2) || null;

  if (!isValidCpf(cpf)) return json({ ok: false, error: "invalid_cpf" }, 400);
  if (!fullName) return json({ ok: false, error: "missing_full_name" }, 400);
  if (!ministerRole) return json({ ok: false, error: "missing_minister_role" }, 400);
  if (!totvsId) return json({ ok: false, error: "missing_totvs_id" }, 400);
  if (password.length < 6) return json({ ok: false, error: "password_too_short", detail: "A senha deve ter ao menos 6 caracteres." }, 400);

  const sb = createAdminClient();
  const { data: church, error: churchError } = await sb
    .from("churches")
    .select("totvs_id, church_name, is_active")
    .eq("totvs_id", totvsId)
    .maybeSingle();

  if (churchError) return json({ ok: false, error: "db_error_church", details: churchError.message }, 500);
  if (!church) {
    return json({
      ok: false,
      error: "church_not_found",
      detail: "Sua igreja nao existe no cadastro. Peca ao pastor para cadastrar primeiro.",
    }, 404);
  }
  if (!church.is_active) {
    return json({
      ok: false,
      error: "church_inactive",
      detail: "Essa igreja esta desativada. Procure a secretaria da igreja.",
    }, 409);
  }

  const { data: existing, error: existingError } = await sb
    .from("users")
    .select("id")
    .eq("cpf", cpf)
    .maybeSingle();
  if (existingError) return json({ ok: false, error: "db_error_existing_user", details: existingError.message }, 500);
  if (existing) return json({ ok: false, error: "cpf_already_registered", detail: "CPF ja cadastrado." }, 409);

  const passwordHash = bcrypt.hashSync(password, 10);
  const totvsAccess = [{
    totvs_id: totvsId,
    role: "obreiro",
    registration_status: "PENDENTE",
  }];

  const { data: inserted, error: insertError } = await sb
    .from("users")
    .insert({
      cpf,
      full_name: fullName,
      role: "obreiro",
      minister_role: ministerRole,
      profession,
      baptism_date: baptismDate,
      ordination_date: ordinationDate,
      phone,
      email,
      avatar_url: avatarUrl,
      cep,
      address_street: addressStreet,
      address_number: addressNumber,
      address_complement: addressComplement,
      address_neighborhood: addressNeighborhood,
      address_city: addressCity,
      address_state: addressState,
      password_hash: passwordHash,
      default_totvs_id: totvsId,
      totvs_access: totvsAccess,
      // Comentario: cadastro rapido nasce inativo — so ativa apos o pastor liberar
      is_active: false,
    })
    .select("id, cpf, full_name, role, minister_role, default_totvs_id")
    .single();

  if (insertError) return json({ ok: false, error: "insert_user_failed", details: insertError.message }, 500);

  return json({
    ok: true,
    user: inserted,
    church: {
      totvs_id: church.totvs_id,
      church_name: church.church_name,
    },
    registration_status: "PENDENTE",
    detail: "Cadastro recebido. Aguardando liberacao da secretaria/pastor.",
  }, 200);
}

async function handleGetRegistrationStatus(req: Request) {
  const session = await verifySessionJWT(req);
  if (!session) return json({ ok: false, error: "unauthorized" }, 401);

  const sb = createAdminClient();
  const { data: user, error } = await sb
    .from("users")
    .select("id, role, minister_role, totvs_access")
    .eq("id", session.user_id)
    .maybeSingle();

  if (error) return json({ ok: false, error: "db_error_user", details: error.message }, 500);
  if (!user) return json({ ok: false, error: "user_not_found" }, 404);

  const status = session.role === "obreiro"
    ? resolveStatus(user.totvs_access, session.active_totvs_id, String(user.minister_role || ""))
    : "APROVADO";

  return json({
    ok: true,
    registration_status: status,
    is_pending: status === "PENDENTE",
    blocked_resources: status === "PENDENTE" ? ["cartas", "documentos"] : [],
  }, 200);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "").trim().toLowerCase();

    switch (action) {
      case "login":
        return await handleLogin(req, body);
      case "select-church":
        return await handleSelectChurch(body);
      case "forgot-password":
      case "forgot-password-request":
        return await handleForgotPassword(req, body);
      case "reset-password":
      case "reset-password-confirm":
        return await handleResetPassword(body);
      case "get-pastor-contact":
        return await handleGetPastorContact(req, body);
      case "public-register":
      case "public-register-member":
      case "signup-request":
      case "register-member":
        return await handlePublicRegister(body);
      case "get-registration-status":
      case "get-my-registration-status":
        return await handleGetRegistrationStatus(req);
      default:
        return json({
          ok: false,
          error: "invalid_action",
          message: "Use uma action valida: \"login\", \"select-church\", \"forgot-password\", \"reset-password\", \"get-pastor-contact\", \"public-register\", \"signup-request\" ou \"get-registration-status\".",
        }, 400);
    }
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
