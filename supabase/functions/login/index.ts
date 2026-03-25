/**
 * login
 * =====
 * O que faz: Autentica o usuário por CPF + senha (bcrypt), valida o acesso às igrejas (totvs_access),
 *            gera dois JWTs: token de sessão da aplicação (USER_SESSION_JWT_SECRET) e token RLS
 *            (APP_RLS_JWT_SECRET) para acesso direto via PostgREST.
 *            Se o usuário tiver acesso a múltiplas igrejas sem padrão, retorna mode="select_church"
 *            para o front solicitar seleção de igreja antes de emitir o token final.
 * Para que serve: Endpoint principal de autenticação do sistema. Chamado na tela de login.
 * Quem pode usar: público (sem autenticação)
 * Recebe: { cpf: string, password: string }
 * Retorna: { ok, mode: "logged_in"|"select_church", token?, rls_token?, user, session?, churches? }
 * Observações: Rate limit persistente no banco — 10 tentativas por CPF em 15 minutos.
 *              O token da aplicação expira em 12 horas.
 *              O token RLS inclui scope_totvs_ids e root_totvs_id para uso nas políticas RLS.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";
import { SignJWT } from "https://esm.sh/jose@5.2.4";
import { corsHeaders, json } from "../_shared/cors.ts";

function onlyDigits(s: string) {
  return String(s || "").replace(/\D+/g, "");
}

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MINUTES = 15;

// Comentario: verifica rate limit pelo banco — persistente mesmo após cold start.
// Conta tentativas falhas do CPF nos últimos 15 minutos.
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

  // Registra esta tentativa (resultado será atualizado depois se for bem sucedida)
  await sb.from("login_attempts").insert({ cpf, ip, success: false });
  return true;
}

// Comentario: marca a última tentativa como bem-sucedida para não contar no rate limit
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

type TotvsAccessItem = string | { totvs_id?: string; role?: string };
type ChurchRow = { totvs_id: string; parent_totvs_id: string | null };
type Body = { cpf?: string; password?: string };

function normalizeTotvsAccess(arr: unknown, defaultRole: string): { totvs_id: string; role: string }[] {
  const out: { totvs_id: string; role: string }[] = [];
  if (!Array.isArray(arr)) return out;

  const allowed = new Set(["admin", "pastor", "obreiro", "secretario", "financeiro"]);
  const safeDefault = allowed.has(defaultRole) ? defaultRole : "obreiro";

  for (const item of arr as TotvsAccessItem[]) {
    if (typeof item === "string") {
      const t = item.trim();
      if (t) out.push({ totvs_id: t, role: safeDefault });
      continue;
    }
    if (item && typeof item === "object") {
      const t = String(item.totvs_id || "").trim();
      const r0 = String(item.role || safeDefault).trim().toLowerCase();
      const r = allowed.has(r0) ? r0 : safeDefault;
      if (t) out.push({ totvs_id: t, role: r });
    }
  }

  const uniq = new Map<string, { totvs_id: string; role: string }>();
  for (const x of out) uniq.set(x.totvs_id, x);
  return [...uniq.values()];
}

function computeScope(rootTotvs: string, churches: ChurchRow[]): string[] {
  const children = new Map<string, string[]>();
  for (const c of churches) {
    const p = c.parent_totvs_id || "";
    if (!children.has(p)) children.set(p, []);
    children.get(p)!.push(String(c.totvs_id));
  }

  const scope = new Set<string>();
  const queue: string[] = [rootTotvs];
  while (queue.length) {
    const cur = queue.shift()!;
    if (scope.has(cur)) continue;
    scope.add(cur);
    for (const k of children.get(cur) || []) queue.push(k);
  }
  return [...scope];
}

function computeRootTotvs(activeTotvs: string, churches: ChurchRow[]): string {
  const parentById = new Map<string, string | null>();
  for (const c of churches) parentById.set(String(c.totvs_id), c.parent_totvs_id ? String(c.parent_totvs_id) : null);

  let cur = activeTotvs;
  const guard = new Set<string>();
  // Comentario: limite de 100 níveis para evitar loop infinito em caso de dado corrompido
  while (guard.size < 100) {
    if (guard.has(cur)) return activeTotvs;
    guard.add(cur);
    const parent = parentById.get(cur) ?? null;
    if (!parent) return cur;
    cur = parent;
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

// Comentario: token para leitura direta via RLS no PostgREST.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const cpf = onlyDigits(body.cpf || "");
    const password = String(body.password || "");
    if (cpf.length !== 11) return json({ ok: false, error: "invalid_cpf" }, 400);
    if (!password) return json({ ok: false, error: "missing_password" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Comentario: rate limit persistente — bloqueia força bruta mesmo após cold start.
    // 10 tentativas falhas por CPF em 15 minutos → erro 429.
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

    const { data: user, error: uErr } = await sb
      .from("users")
      .select("id, cpf, full_name, role, password_hash, is_active, totvs_access, default_totvs_id, payment_status, discipline_status, discipline_block_reason")
      .eq("cpf", cpf)
      .maybeSingle();

    if (uErr) return json({ ok: false, error: "db_error" }, 500);
    // Comentario: retorna user_not_found (nao invalid-credentials) para o front saber abrir o cadastro rapido
    if (!user) return json({ ok: false, error: "user_not_found" }, 401);
    if (!user.is_active) return json({ ok: false, error: "inactive_user" }, 403);

    if (String(user.payment_status || "").toUpperCase() === "BLOQUEADO_PAGAMENTO") {
      return json({ ok: false, error: "blocked_payment", message: "Acesso bloqueado por pagamento pendente." }, 403);
    }
    if (String(user.discipline_status || "").toUpperCase() === "BLOQUEADO_DISCIPLINA") {
      return json({
        ok: false,
        error: "blocked_discipline",
        message: String(user.discipline_block_reason || "Acesso bloqueado por faltas sem justificativa em reuniões ministeriais."),
      }, 403);
    }

    const userRole = String(user.role || "obreiro").toLowerCase();
    const currentHash = user.password_hash ? String(user.password_hash) : "";
    if (!currentHash) {
      const newHash = bcrypt.hashSync(password, 10);
      const { error: setErr } = await sb.from("users").update({ password_hash: newHash }).eq("id", user.id);
      if (setErr) return json({ ok: false, error: "set_password_failed" }, 500);
    } else {
      const ok = bcrypt.compareSync(password, currentHash);
      if (!ok) return json({ ok: false, error: "invalid-credentials" }, 401);
    }

    // Comentario: login bem sucedido — marca no banco para não contar no rate limit
    await markLoginSuccess(sb, cpf);

    let access = normalizeTotvsAccess(user.totvs_access, userRole);

    // Comentario: fallback para bases antigas/importadas sem totvs_access,
    // usando default_totvs_id para não bloquear primeiro login.
    if (access.length === 0) {
      const defaultTotvsFallback = String(user.default_totvs_id || "").trim();
      if (defaultTotvsFallback) {
        access = [{ totvs_id: defaultTotvsFallback, role: userRole }];
        await sb.from("users").update({ totvs_access: access }).eq("id", user.id);
      }
    }

    if (access.length === 0 && userRole === "admin") {
      const { data: allForAdmin, error: allForAdminErr } = await sb
        .from("churches")
        .select("totvs_id")
        .order("totvs_id", { ascending: true });
      if (allForAdminErr) return json({ ok: false, error: "db_error" }, 500);
      const ids = (allForAdmin || []).map((c) => String(c.totvs_id || "")).filter(Boolean);
      access = ids.map((id) => ({ totvs_id: id, role: "admin" }));
      if (ids.length > 0) await sb.from("users").update({ totvs_access: access }).eq("id", user.id);
    }

    if (access.length === 0) return json({ ok: false, error: "no_totvs_access", message: "Usuário sem acesso de igreja." }, 403);
    const totvsIds = access.map((a) => a.totvs_id);

    const { data: churchesMeta, error: mErr } = await sb
      .from("churches")
      .select("totvs_id, church_name, class, parent_totvs_id")
      .in("totvs_id", totvsIds);
    if (mErr) return json({ ok: false, error: "db_error" }, 500);

    const metaByTotvs = new Map<string, Record<string, unknown>>();
    for (const c of churchesMeta || []) metaByTotvs.set(String(c.totvs_id), c as Record<string, unknown>);

    const churchesForUI = access.map((a) => {
      const meta = metaByTotvs.get(a.totvs_id);
      return {
        totvs_id: a.totvs_id,
        role: a.role,
        church_name: String(meta?.church_name || ""),
        church_class: String(meta?.class || ""),
      };
    });

    const defaultTotvs = String(user.default_totvs_id || "").trim();
    const defaultAllowed = defaultTotvs && totvsIds.includes(defaultTotvs) ? defaultTotvs : "";
    const pastorAccess = access.filter((a) => a.role === "pastor" || a.role === "secretario").map((a) => a.totvs_id);

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
      const activeEntry = rawAccess.find((item: Record<string, unknown>) => String(item?.totvs_id || "").trim() === activeTotvs);
      const regStatus = String(activeEntry?.registration_status || "APROVADO").trim().toUpperCase();
      if (regStatus === "PENDENTE") {
        return json({
          ok: false,
          error: "registration_pending",
          message: "Seu cadastro está pendente de aprovação. Aguarde a liberação do pastor da sua igreja.",
        }, 403);
      }
    }

    const { data: allChurches, error: aErr } = await sb.from("churches").select("totvs_id, parent_totvs_id");
    if (aErr) return json({ ok: false, error: "db_error" }, 500);
    const all = (allChurches || []) as ChurchRow[];
    const scope_totvs_ids =
      userRole === "admin" ? all.map((c) => String(c.totvs_id || "")).filter(Boolean) : computeScope(activeTotvs, all);
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
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
