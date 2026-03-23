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
 * Observações: Proteção contra força bruta: rate limit de 10 tentativas por IP em 15 minutos.
 *              O token da aplicação expira em 12 horas.
 *              O token RLS inclui scope_totvs_ids e root_totvs_id para uso nas políticas RLS.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";
import { SignJWT } from "https://esm.sh/jose@5.2.4";

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

function onlyDigits(s: string) {
  return String(s || "").replace(/\D+/g, "");
}

// ──────────────────────────────────────────────────────────────
// Rate limiting por IP — proteção contra força bruta no login.
//
// Máximo de RATE_LIMIT_MAX tentativas por IP em RATE_LIMIT_WINDOW_MS.
// Depois desse limite, o IP recebe 429 e deve aguardar a janela resetar.
// O mapa fica em memória: é "melhor esforço" (zera no cold start),
// mas dificulta muito ataques sem precisar de Redis ou banco externo.
// ──────────────────────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutos

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

// Limpeza periódica para evitar crescimento indefinido do mapa em memória.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 30 * 60 * 1000);

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
  while (true) {
    if (guard.has(cur)) return activeTotvs;
    guard.add(cur);
    const parent = parentById.get(cur) ?? null;
    if (!parent) return cur;
    cur = parent;
  }
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

  // Extrai o IP do cliente e verifica o rate limit antes de qualquer acesso ao banco.
  // x-forwarded-for pode conter múltiplos IPs (proxies) — pegamos o primeiro.
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  if (!checkRateLimit(clientIp)) {
    return json(
      { ok: false, error: "rate_limit_exceeded", message: "Muitas tentativas de login. Aguarde 15 minutos e tente novamente." },
      429,
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const cpf = onlyDigits(body.cpf || "");
    const password = String(body.password || "");
    if (cpf.length !== 11) return json({ ok: false, error: "invalid_cpf" }, 400);
    if (!password) return json({ ok: false, error: "missing_password" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: user, error: uErr } = await sb
      .from("users")
      .select("id, cpf, full_name, role, password_hash, is_active, totvs_access, default_totvs_id, payment_status, discipline_status, discipline_block_reason")
      .eq("cpf", cpf)
      .maybeSingle();

    if (uErr) return json({ ok: false, error: "db_error", details: uErr.message }, 500);
    if (!user) return json({ ok: false, error: "invalid-credentials" }, 401);
    if (!user.is_active) return json({ ok: false, error: "inactive_user" }, 403);
    if (String(user.payment_status || "").toUpperCase() === "BLOQUEADO_PAGAMENTO") {
      return json(
        { ok: false, error: "blocked_payment", message: "Acesso bloqueado por pagamento pendente." },
        403,
      );
    }
    if (String(user.discipline_status || "").toUpperCase() === "BLOQUEADO_DISCIPLINA") {
      return json(
        {
          ok: false,
          error: "blocked_discipline",
          message: String(user.discipline_block_reason || "Acesso bloqueado por faltas sem justificativa em reunioes ministeriais."),
        },
        403,
      );
    }

    const userRole = String(user.role || "obreiro").toLowerCase();
    const currentHash = user.password_hash ? String(user.password_hash) : "";
    if (!currentHash) {
      const newHash = bcrypt.hashSync(password, 10);
      const { error: setErr } = await sb.from("users").update({ password_hash: newHash }).eq("id", user.id);
      if (setErr) return json({ ok: false, error: "set_password_failed", details: setErr.message }, 500);
    } else {
      const ok = bcrypt.compareSync(password, currentHash);
      if (!ok) return json({ ok: false, error: "invalid-credentials" }, 401);
    }

    let access = normalizeTotvsAccess(user.totvs_access, userRole);

    // Comentario: fallback para bases antigas/importadas sem totvs_access,
    // usando default_totvs_id para nao bloquear primeiro login.
    if (access.length === 0) {
      const defaultTotvsFallback = String(user.default_totvs_id || "").trim();
      if (defaultTotvsFallback) {
        access = [{ totvs_id: defaultTotvsFallback, role: userRole }];
        await sb
          .from("users")
          .update({ totvs_access: access })
          .eq("id", user.id);
      }
    }

    if (access.length === 0 && userRole === "admin") {
      const { data: allForAdmin, error: allForAdminErr } = await sb
        .from("churches")
        .select("totvs_id")
        .order("totvs_id", { ascending: true });
      if (allForAdminErr) return json({ ok: false, error: "db_error_admin_access", details: allForAdminErr.message }, 500);
      const ids = (allForAdmin || []).map((c) => String(c.totvs_id || "")).filter(Boolean);
      access = ids.map((id) => ({ totvs_id: id, role: "admin" }));
      if (ids.length > 0) {
        await sb.from("users").update({ totvs_access: access }).eq("id", user.id);
      }
    }

    if (access.length === 0) return json({ ok: false, error: "no_totvs_access", message: "Usuario sem acesso de igreja." }, 403);
    const totvsIds = access.map((a) => a.totvs_id);

    const { data: churchesMeta, error: mErr } = await sb
      .from("churches")
      .select("totvs_id, church_name, class, parent_totvs_id")
      .in("totvs_id", totvsIds);
    if (mErr) return json({ ok: false, error: "db_error_churches_meta", details: mErr.message }, 500);

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

    const { data: allChurches, error: aErr } = await sb.from("churches").select("totvs_id, parent_totvs_id");
    if (aErr) return json({ ok: false, error: "db_error_scope", details: aErr.message }, 500);
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
