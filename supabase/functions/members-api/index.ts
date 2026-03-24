import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";


// Comentario: headers CORS necessarios para chamadas do frontend.
function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-admin-key, x-client-info",
  };
}

// Comentario: retorna JSON com status HTTP e headers CORS ja incluidos.
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}
;
}

);
}

type Role = "admin" | "pastor" | "obreiro";
type SessionClaims = {
  user_id: string;
  role: Role;
  active_totvs_id: string;
  scope_totvs_ids?: string[];
};

async function verifySessionJWT(req: Request): Promise<SessionClaims | null> {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  const token = m[1].trim();
  const secret = Deno.env.get("USER_SESSION_JWT_SECRET") || "";
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    const user_id = String(payload.sub || "");
    const role = String(payload.role || "").toLowerCase() as Role;
    const active_totvs_id = String(payload.active_totvs_id || "");
    const scope_totvs_ids = Array.isArray(payload.scope_totvs_ids)
      ? payload.scope_totvs_ids.map((x) => String(x || "")).filter(Boolean)
      : [];
    if (!user_id || !active_totvs_id) return null;
    if (!["admin", "pastor", "obreiro", "secretario", "financeiro"].includes(role)) return null;
    return { user_id, role, active_totvs_id, scope_totvs_ids };
  } catch {
    return null;
  }
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

function canManage(sessionRole: Role, sessionClass: ChurchClass | null, targetClass: ChurchClass | null): boolean {
  if (sessionRole === "admin") return true;
  if (!sessionClass || !targetClass) return false;
  const rank: Record<ChurchClass, number> = { estadual: 5, setorial: 4, central: 3, regional: 2, local: 1 };
  return rank[targetClass] <= rank[sessionClass];
}


async function handleCreate(req: Request, bodyRaw: Record<string, unknown>): Promise<Response> {
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
        .select("id, role, matricula")
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
        if (!["admin", "pastor", "obreiro", "secretario", "financeiro"].includes(requestedRole)) return json({ ok: false, error: "invalid_role" }, 400);
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
      const matriculaInput = String(body.matricula || "").trim();
      const matriculaFinal = matriculaInput
        || String((existingUser as Record<string, unknown> | undefined)?.matricula || "").trim()
        || (cpf ? `${cpf.slice(-6)}${Date.now().toString().slice(-4)}` : "");
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
      };
      if (password_hash) payload.password_hash = password_hash;

      const { data: saved, error: saveErr } = await sb
        .from("users")
        .upsert(payload, { onConflict: "cpf" })
        .select("id, cpf, full_name, role, default_totvs_id, totvs_access, is_active, updated_at")
        .single();
      if (saveErr) return json({ ok: false, error: "db_error_save_user", details: saveErr.message }, 500);

      return json({ ok: true, user: saved }, 200);
}

async function handleDelete(req: Request, body: Record<string, unknown>): Promise<Response> {
  const session = await verifySessionJWT(req);
      if (!session) return json({ ok: false, error: "unauthorized" }, 401);
      if (session.role === "obreiro") return json({ ok: false, error: "forbidden" }, 403);

      const body = (await req.json().catch(() => ({}))) as { user_id?: string };
      const targetId = String(body.user_id || "").trim();
      if (!targetId) return json({ ok: false, error: "missing_user_id" }, 400);
      if (targetId === session.user_id) return json({ ok: false, error: "cannot_delete_self" }, 409);

      const sb = createClient(
        Deno.env.get("SUPABASE_URL") || "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      );

      const { data: target, error: targetErr } = await sb
        .from("users")
        .select("id, role, default_totvs_id")
        .eq("id", targetId)
        .maybeSingle();

      if (targetErr) return json({ ok: false, error: "db_error_target", details: targetErr.message }, 500);
      if (!target) return json({ ok: false, error: "user_not_found" }, 404);

      if (session.role === "pastor") {
        const targetRole = String(target.role || "").toLowerCase();
        if (targetRole === "admin") return json({ ok: false, error: "forbidden_target_admin" }, 403);
        const targetTotvs = String(target.default_totvs_id || "");
        const allowed = new Set([session.active_totvs_id, ...(session.scope_totvs_ids || [])]);
        if (!targetTotvs || !allowed.has(targetTotvs)) {
          return json({ ok: false, error: "forbidden_out_of_scope" }, 403);
        }
      }

      const cleanupTables = [
        "release_requests",
        "member_carteirinha_documents",
        "member_ficha_documents",
        "member_ficha_obreiro_documents",
      ];
      for (const table of cleanupTables) {
        await sb.from(table).delete().eq("member_id", targetId);
        await sb.from(table).delete().eq("requester_user_id", targetId);
        await sb.from(table).delete().eq("requested_by_user_id", targetId);
      }
      await sb.from("notifications").delete().eq("user_id", targetId);
      await sb.from("letters").delete().eq("preacher_user_id", targetId);

      const { error: userDeleteErr } = await sb.from("users").delete().eq("id", targetId);
      if (userDeleteErr) return json({ ok: false, error: "db_error_delete_user", details: userDeleteErr.message }, 500);

      return json({ ok: true }, 200);
}

async function handleToggleActive(req: Request, body: Record<string, unknown>): Promise<Response> {
  const session = await verifySessionJWT(req);
      if (!session) return json({ ok: false, error: "unauthorized" }, 401);
      if (session.role === "obreiro") return json({ ok: false, error: "forbidden" }, 403);

      const body = (await req.json().catch(() => ({}))) as Body;
      const worker_id = String(body.worker_id || "").trim();
      if (!worker_id) return json({ ok: false, error: "missing_worker_id" }, 400);
      if (typeof body.is_active !== "boolean") return json({ ok: false, error: "missing_is_active" }, 400);

      const sb = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

      const { data: worker, error: workerErr } = await sb
        .from("users")
        .select("id, role, default_totvs_id")
        .eq("id", worker_id)
        .maybeSingle();
      if (workerErr) return json({ ok: false, error: "db_error_worker", details: workerErr.message }, 500);
      if (!worker) return json({ ok: false, error: "worker_not_found" }, 404);
      if (String(worker.id) === session.user_id) return json({ ok: false, error: "cannot_toggle_self" }, 409);

      const { data: churches, error: churchesErr } = await sb.from("churches").select("totvs_id,parent_totvs_id,class");
      if (churchesErr) return json({ ok: false, error: "db_error_churches", details: churchesErr.message }, 500);
      const churchRows = (churches || []) as ChurchRow[];
      const scope = computeScope(session.active_totvs_id, churchRows);
      const map = new Map(churchRows.map((c) => [String(c.totvs_id), c]));
      const sessionClass = normalizeChurchClass(map.get(session.active_totvs_id)?.class);
      const workerTotvs = String(worker.default_totvs_id || "").trim();
      const workerClass = normalizeChurchClass(map.get(workerTotvs)?.class);

      if (session.role !== "admin") {
        if (!workerTotvs || !scope.has(workerTotvs)) return json({ ok: false, error: "worker_out_of_scope" }, 403);
        if (!canManage(session.role, sessionClass, workerClass)) return json({ ok: false, error: "forbidden_hierarchy" }, 403);
      }

      const { data: saved, error: saveErr } = await sb
        .from("users")
        .update({ is_active: body.is_active })
        .eq("id", worker_id)
        .select("id, is_active, updated_at")
        .single();
      if (saveErr) return json({ ok: false, error: "db_error_update_worker", details: saveErr.message }, 500);

      return json({ ok: true, worker: saved }, 200);
}

async function handleSetDirectRelease(req: Request, body: Record<string, unknown>): Promise<Response> {
  const session = await verifySessionJWT(req);
      if (!session) return json({ ok: false, error: "unauthorized" }, 401);
      if (session.role === "obreiro") return json({ ok: false, error: "forbidden" }, 403);

      const body = (await req.json().catch(() => ({}))) as Body;
      const worker_id = String(body.worker_id || "").trim();
      if (!worker_id) return json({ ok: false, error: "missing_worker_id" }, 400);
      if (typeof body.can_create_released_letter !== "boolean") {
        return json({ ok: false, error: "missing_can_create_released_letter" }, 400);
      }

      const sb = createClient(
        Deno.env.get("SUPABASE_URL") || "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      );

      const { data: target, error: targetErr } = await sb
        .from("users")
        .select("id, role, default_totvs_id")
        .eq("id", worker_id)
        .maybeSingle();

      if (targetErr) return json({ ok: false, error: "db_error_target", details: targetErr.message }, 500);
      if (!target) return json({ ok: false, error: "worker_not_found" }, 404);
      if (String(target.id) === session.user_id) {
        return json({ ok: false, error: "cannot_release_self_direct" }, 403);
      }
      if (String(target.role || "").toLowerCase() !== "obreiro") {
        return json({ ok: false, error: "target_is_not_obreiro" }, 403);
      }

      if (session.role !== "admin") {
        const { data: churches, error: churchesErr } = await sb.from("churches").select("totvs_id,parent_totvs_id,class");
        if (churchesErr) return json({ ok: false, error: "db_error_churches", details: churchesErr.message }, 500);

        const churchRows = (churches || []) as ChurchRow[];
        const scope = computeScope(session.active_totvs_id, churchRows);
        const map = new Map(churchRows.map((c) => [String(c.totvs_id), c]));
        const sessionClass = normalizeChurchClass(map.get(session.active_totvs_id)?.class);
        const targetTotvs = String(target.default_totvs_id || "").trim();
        const targetClass = normalizeChurchClass(map.get(targetTotvs)?.class);

        if (!targetTotvs || !scope.has(targetTotvs)) {
          return json({ ok: false, error: "worker_out_of_scope" }, 403);
        }
        if (!canManage(session.role, sessionClass, targetClass)) {
          return json({ ok: false, error: "forbidden_hierarchy" }, 403);
        }
      }

      const { data: updated, error: updateErr } = await sb
        .from("users")
        .update({ can_create_released_letter: body.can_create_released_letter })
        .eq("id", worker_id)
        .select("id, can_create_released_letter, updated_at")
        .single();

      if (updateErr) return json({ ok: false, error: "db_error_update", details: updateErr.message }, 500);
      return json({ ok: true, worker: updated }, 200);
}

async function handleSetPaymentStatus(req: Request, body: Record<string, unknown>): Promise<Response> {
  const session = await verifySessionJWT(req);
      if (!session) return json({ ok: false, error: "unauthorized" }, 401);
      if (session.role !== "admin") return json({ ok: false, error: "forbidden_only_admin" }, 403);

      const body = (await req.json().catch(() => ({}))) as Body;
      const user_id = String(body.user_id || "").trim();
      const payment_status = String(body.payment_status || "").trim().toUpperCase() as PaymentStatus;
      const reason = String(body.reason || "").trim() || null;
      const amount = typeof body.amount === "number" && Number.isFinite(body.amount) ? body.amount : null;
      const due_date = String(body.due_date || "").trim() || null;

      if (!user_id) return json({ ok: false, error: "missing_user_id" }, 400);
      if (!["ATIVO", "BLOQUEADO_PAGAMENTO"].includes(payment_status)) {
        return json({ ok: false, error: "invalid_payment_status" }, 400);
      }
      if (user_id === session.user_id) return json({ ok: false, error: "cannot_block_self_payment" }, 409);

      const sb = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

      const { data: target, error: targetErr } = await sb
        .from("users")
        .select("id, full_name, cpf, phone, email, role, default_totvs_id")
        .eq("id", user_id)
        .maybeSingle();
      if (targetErr) return json({ ok: false, error: "db_error_target", details: targetErr.message }, 500);
      if (!target) return json({ ok: false, error: "user_not_found" }, 404);

      const nowIso = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        payment_status,
        payment_block_reason: payment_status === "BLOQUEADO_PAGAMENTO" ? reason : null,
        payment_updated_by: session.user_id,
        payment_blocked_at: payment_status === "BLOQUEADO_PAGAMENTO" ? nowIso : null,
        payment_unblocked_at: payment_status === "ATIVO" ? nowIso : null,
      };

      const { data: updated, error: updateErr } = await sb
        .from("users")
        .update(updatePayload)
        .eq("id", user_id)
        .select("id, payment_status, payment_block_reason, payment_blocked_at, payment_unblocked_at, updated_at")
        .single();
      if (updateErr) return json({ ok: false, error: "db_error_update", details: updateErr.message }, 500);

      // Comentario: webhook de pagamento não pode quebrar o fluxo principal.
      let n8nOk = false;
      let n8nStatus = 0;
      let n8nResponse: unknown = null;
      try {
        const payload = {
          action: "payment_status_changed",
          event_at: nowIso,
          user: {
            id: target.id,
            full_name: target.full_name,
            cpf: target.cpf,
            phone: target.phone,
            email: target.email,
            role: target.role,
            default_totvs_id: target.default_totvs_id,
          },
          payment: {
            status: payment_status,
            reason,
            amount,
            due_date,
          },
          performed_by: {
            id: session.user_id,
            role: session.role,
          },
        };

        const n8nResp = await fetch(N8N_PAYMENT_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        n8nStatus = n8nResp.status;
        const raw = await n8nResp.text();
        try {
          n8nResponse = JSON.parse(raw);
        } catch {
          n8nResponse = { raw };
        }
        n8nOk = n8nResp.ok;
      } catch (err) {
        n8nOk = false;
        n8nResponse = { error: String(err) };
      }

      return json({ ok: true, user: updated, n8n: { ok: n8nOk, status: n8nStatus, response: n8nResponse } }, 200);
}

async function handleSetRegistrationStatus(req: Request, body: Record<string, unknown>): Promise<Response> {
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

      if (targetError) return json({ ok: false, error: "db_error_target", details: targetError.message }, 500);
      if (!target) return json({ ok: false, error: "user_not_found" }, 404);

      if (String(target.role || "") !== "obreiro") {
        return json({ ok: false, error: "target_is_not_obreiro" }, 409);
      }

      const { data: churches, error: churchesErr } = await sb
        .from("churches")
        .select("totvs_id,parent_totvs_id,class");

      if (churchesErr) return json({ ok: false, error: "db_error_churches", details: churchesErr.message }, 500);

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

      const { error: updateError } = await sb
        .from("users")
        .update({
          totvs_access: nextTotvsAccess,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (updateError) return json({ ok: false, error: "db_error_update", details: updateError.message }, 500);

      return json({ ok: true, user_id: userId, registration_status: status }, 200);
}

async function handleUpdateAvatar(_req: Request, body: Record<string, unknown>): Promise<Response> {
  const body = await req.json().catch(() => ({})) as {
        user_id?: string;
        cpf?: string;
        avatar_url?: string;
      };

      const userId = String(body.user_id || "").trim();
      const cpf = String(body.cpf || "").replace(/\D/g, "");
      const avatarUrl = String(body.avatar_url || "").trim();

      if (!userId) return json({ ok: false, error: "user_id_required" }, 400);
      if (cpf.length !== 11) return json({ ok: false, error: "cpf_required" }, 400);
      if (!avatarUrl) return json({ ok: false, error: "avatar_url_required" }, 400);

      const sb = createClient(
        Deno.env.get("SUPABASE_URL") || "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      );

      // Verifica que o user_id e o cpf correspondem ao mesmo usuario antes de atualizar
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

      return json({ ok: true, avatar_url: avatarUrl });
}

async function handleList(req: Request, body: Record<string, unknown>): Promise<Response> {
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
      if (churchesErr) return json({ ok: false, error: "db_error_churches", details: churchesErr.message }, 500);
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

      // Comentario: normaliza o filtro de cargo para comparar sem acento e sem diferenca de maiusculas.
      // Exemplo: "presbitero" bate com "Presbítero" no banco; "diacono" bate com "Diácono".
      const normalizedRoleFilter = body.minister_role ? normalizeMinisterRole(body.minister_role) : null;

      const filtered = (users || []).filter((u: Record<string, unknown>) => {
        const defaultTotvs = String(u.default_totvs_id || "").trim();
        if (!defaultTotvs) return false;
        if (!scope.has(defaultTotvs)) return false;
        // Comentario: quando seleciona uma igreja, traz somente membros dessa igreja (sem filhas).
        if (churchTotvsFilter && defaultTotvs !== churchTotvsFilter) return false;
        // Comentario: filtra por cargo ministerial normalizando acentos dos dois lados.
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
          return json({ ok: false, error: "db_error_attendance", details: attendanceErr.message }, 500);
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
      };
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

async function handleDashboard(req: Request, body: Record<string, unknown>): Promise<Response> {
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
          "id, role, full_name, cpf, rg, phone, email, birth_date, baptism_date, ordination_date, marital_status, minister_role, matricula, profession, avatar_url, cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, default_totvs_id, is_active, signature_url, stamp_pastor_url"
        )
        .eq("id", user_id)
        .maybeSingle();

      if (uErr) return json({ ok: false, error: "db_error_user", details: uErr.message }, 500);
      if (!user) return json({ ok: false, error: "user_not_found" }, 404);
      if (!user.is_active) return json({ ok: false, error: "inactive_user" }, 403);

      const effectiveTotvs = session.role === "obreiro"
        ? String(user.default_totvs_id || activeTotvs)
        : activeTotvs;

      const { data: church, error: cErr } = await sb
        .from("churches")
        .select("*")
        .eq("totvs_id", effectiveTotvs)
        .maybeSingle();

      if (cErr) return json({ ok: false, error: "db_error_church", details: cErr.message }, 500);
      if (!church) return json({ ok: false, error: "church_not_found" }, 404);

      function buildLettersQuery(includeUrlPronta: boolean) {
        const selectFields = includeUrlPronta
          ? "id, preacher_name, minister_role, preach_date, church_origin, church_destination, status, storage_path, url_pronta, url_carta, created_at"
          : "id, preacher_name, minister_role, preach_date, church_origin, church_destination, status, storage_path, created_at";

        let q = sb
          .from("letters")
          .select(selectFields, { count: "exact" })
          .neq("status", "EXCLUIDA");

        // Comentario: para obreiro, o historico e pessoal (do proprio pregador),
        // independente da igreja ativa/default no token.
        if (session.role !== "obreiro") {
          q = q.eq("church_totvs_id", effectiveTotvs);
        }

        // Comentario: regra fechada para obreiro.
        // Sempre filtra pelo ID do usuario logado na coluna preacher_user_id.
        q = q.eq("preacher_user_id", user_id);

        if (dateStart) q = q.gte("created_at", startOfDayISO(dateStart));
        if (dateEnd) q = q.lte("created_at", endOfDayISO(dateEnd));

        return q.order("created_at", { ascending: false }).range(from, to);
      }

      let lettersResult = await buildLettersQuery(true);
      let fallbackWithoutUrlPronta = false;
      if (
        lettersResult.error &&
        (
          String(lettersResult.error.message || "").toLowerCase().includes("url_pronta") ||
          String(lettersResult.error.message || "").toLowerCase().includes("url_carta")
        )
      ) {
        lettersResult = await buildLettersQuery(false);
        fallbackWithoutUrlPronta = true;
      }

      const { data: lettersRaw, error: lErr, count } = lettersResult;
      if (lErr) return json({ ok: false, error: "db_error_letters", details: lErr.message }, 500);

      const letters = fallbackWithoutUrlPronta && Array.isArray(lettersRaw)
        ? lettersRaw.map((row: Record<string, unknown>) => ({ ...row, url_pronta: false, url_carta: null }))
        : lettersRaw;

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
}

async function handleGetRegistrationStatus(req: Request, _body: Record<string, unknown>): Promise<Response> {
  const session = await verifySessionJWT(req);
      if (!session) return json({ ok: false, error: "unauthorized" }, 401);

      const sb = createClient(
        Deno.env.get("SUPABASE_URL") || "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      );

      const { data: user, error } = await sb
        .from("users")
        .select("id, role, minister_role, totvs_access")
        .eq("id", session.user_id)
        .maybeSingle();

      if (error) return json({ ok: false, error: "db_error_user", details: error.message }, 500);
      if (!user) return json({ ok: false, error: "user_not_found" }, 404);

      // Comentario: pastor/admin sempre aprovados para operacao administrativa.
      const status = session.role === "obreiro"
        ? resolveStatus(user.totvs_access, session.active_totvs_id, String(user.minister_role || ""))
        : "APROVADO";

      return json({
        ok: true,
        registration_status: status,
        is_pending: status === "PENDENTE",
        blocked_resources: status === "PENDENTE"
          ? ["cartas", "documentos"]
          : [],
      }, 200);
}

// Roteador principal: le o campo action e chama o handler correspondente.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const body = (await req.json().catch(() => (})  )) as Record<string, unknown>;
    const action = String(body.action || "").trim();
    switch (action) {
      case "create": return await handleCreate(req, body);
      case "delete": return await handleDelete(req, body);
      case "toggle-active": return await handleToggleActive(req, body);
      case "set-direct-release": return await handleSetDirectRelease(req, body);
      case "set-payment-status": return await handleSetPaymentStatus(req, body);
      case "set-registration-status": return await handleSetRegistrationStatus(req, body);
      case "update-avatar": return await handleUpdateAvatar(req, body);
      case "list": return await handleList(req, body);
      case "dashboard": return await handleDashboard(req, body);
      case "get-registration-status": return await handleGetRegistrationStatus(req, body);
      default: return json({ ok: false, error: "unknown_action" }, 400);
    }
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});