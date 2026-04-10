/**
 * set-user-registration-status
 * =============================
 * O que faz: Aprova ou coloca em pend�ncia o cadastro de um obreiro, atualizando o campo
 *            registration_status dentro do array totvs_access do usu�rio.
 * Para que serve: Usada pelo pastor/admin para aprovar novos cadastros que chegaram via
 *                 public-register-member (auto-cadastro) ou para revogar aprova��es.
 * Quem pode usar: admin, pastor (somente obreiros dentro do pr�prio escopo e hierarquia)
 * Recebe: { user_id: string, registration_status: "APROVADO"|"PENDENTE" }
 * Retorna: { ok, user_id, registration_status }
 * Observacoes: Funciona para qualquer role (obreiro ou pastor). Pastor mae pode
 *              bloquear/aprovar pastores do seu escopo. A hierarquia garante a seguranca.
 *              O registration_status � atualizado em TODOS os itens do array totvs_access.
 *              Envia notificação interna e push ao usuário avisando sobre a aprovação/rejeição.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";
import { sendInternalPushNotification } from "../_shared/push.ts";

type Role = "admin" | "pastor" | "obreiro";
type RegistrationStatus = "APROVADO" | "PENDENTE";
type ChurchClass = "estadual" | "setorial" | "central" | "regional" | "local";

type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };
type ChurchRow = { totvs_id: string; parent_totvs_id: string | null; class: string | null };

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
    if (!["admin", "pastor", "obreiro", "secretario", "financeiro"].includes(role)) return null;

    return { user_id, role, active_totvs_id };
  } catch {
    return null;
  }
}

function normalizeTotvsAccess(raw: unknown, status: RegistrationStatus) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        const value = String(item || "").trim();
        if (!value) return null;
        return { totvs_id: value, role: "obreiro", registration_status: status };
      }
      const entry = item as Record<string, unknown>;
      const totvsId = String(entry.totvs_id || "").trim();
      if (!totvsId) return null;
      const roleRaw = String(entry.role || "obreiro").toLowerCase();
      const role = roleRaw === "admin" || roleRaw === "pastor" || roleRaw === "obreiro" ? roleRaw : "obreiro";
      return {
        ...entry,
        totvs_id: totvsId,
        role,
        registration_status: status,
      };
    })
    .filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);
    if (session.role === "obreiro") return json({ ok: false, error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({})) as {
      user_id?: string;
      registration_status?: RegistrationStatus;
    };

    const userId = String(body.user_id || "").trim();
    const status = String(body.registration_status || "").toUpperCase() as RegistrationStatus;

    if (!userId) return json({ ok: false, error: "missing_user_id" }, 400);
    if (status !== "APROVADO" && status !== "PENDENTE") {
      return json({ ok: false, error: "invalid_registration_status" }, 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data: target, error: targetError } = await sb
      .from("users")
      .select("id, role, default_totvs_id, totvs_access")
      .eq("id", userId)
      .maybeSingle();

    if (targetError) return json({ ok: false, error: "db_error_target", details: "erro interno" }, 500);
    if (!target) return json({ ok: false, error: "user_not_found" }, 404);

    // Comentario: pastor mae pode bloquear/aprovar pastores e obreiros do seu escopo.
    // A verificacao de hierarquia em canManageMember ja garante que so pode
    // gerenciar membros de nivel igual ou inferior.

    const { data: churches, error: churchesErr } = await sb
      .from("churches")
      .select("totvs_id,parent_totvs_id,class");

    if (churchesErr) return json({ ok: false, error: "db_error_churches", details: "erro interno" }, 500);

    const rows = (churches || []) as ChurchRow[];
    const scope = computeScope(session.active_totvs_id, rows);
    const sessionClass = normalizeChurchClass(rows.find((c) => c.totvs_id === session.active_totvs_id)?.class);
    const targetTotvs = String(target.default_totvs_id || "").trim();
    const targetClass = normalizeChurchClass(rows.find((c) => c.totvs_id === targetTotvs)?.class);

    const canManage = canManageMember(
      session.role,
      session.active_totvs_id,
      targetTotvs,
      sessionClass,
      targetClass,
      scope,
    );

    if (!canManage) return json({ ok: false, error: "forbidden" }, 403);

    const nextTotvsAccess = normalizeTotvsAccess(target.totvs_access, status);

    // Comentario: atualiza is_active junto com o status para manter consistencia.
    // APROVADO = ativo, PENDENTE = inativo (bloqueado).
    const { error: updateError } = await sb
      .from("users")
      .update({
        totvs_access: nextTotvsAccess,
        is_active: status === "APROVADO",
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateError) return json({ ok: false, error: "db_error_update", details: "erro interno" }, 500);

    // Comentario: cria notificacao interna para o usuario sabendo o resultado da aprovacao/rejeicao
    const notificationTitle = status === "APROVADO" ? "Cadastro Aprovado! ✅" : "Cadastro Pendente ⏳";
    const notificationMsg = status === "APROVADO"
      ? "Parabéns! Seu cadastro foi aprovado. Você agora pode usar todas as funcionalidades do sistema."
      : "Seu cadastro está aguardando aprovação. Um administrador revisará em breve.";

    // Comentario: notificações são fire-and-forget — nunca devem causar erro no front
    try {
      await sb.from("notifications").insert({
        user_id: userId,
        church_totvs_id: targetTotvs,
        type: "registration_status",
        title: notificationTitle,
        message: notificationMsg,
        read_at: null,
      });
    } catch (err) {
      console.warn("[set-user-registration-status] Erro ao criar notificação interna:", err);
    }

    try {
      await sendInternalPushNotification({
        title: notificationTitle,
        body: notificationMsg,
        url: "/",
        user_ids: [userId],
      });
    } catch (err) {
      console.warn("[set-user-registration-status] Erro ao enviar push:", err);
    }

    return json({ ok: true, user_id: userId, registration_status: status }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
