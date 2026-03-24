/**
 * set-user-payment-status
 * =======================
 * O que faz: Atualiza o status de pagamento de um usuário para ATIVO ou BLOQUEADO_PAGAMENTO.
 *            Quando bloqueado, salva o motivo (reason), valor (amount) e data de vencimento
 *            (due_date). Dispara webhook n8n (N8N_PAYMENT_WEBHOOK_URL) para notificação.
 * Para que serve: Usada pelo admin para controlar a situação financeira do membro no sistema,
 *                 podendo bloquear acesso por inadimplência.
 * Quem pode usar: somente admin
 * Recebe: { user_id, payment_status: "ATIVO"|"BLOQUEADO_PAGAMENTO",
 *           reason?, amount?, due_date? }
 * Retorna: { ok, user, n8n: { ok, status, response } }
 * Observações: Admin não pode bloquear a si mesmo. O webhook de pagamento não interrompe o
 *              fluxo principal mesmo que falhe.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";
import { insertNotification, sendInternalPushNotification } from "../_shared/push.ts";

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  };
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders() });
}

type Role = "admin" | "pastor" | "obreiro";
type PaymentStatus = "ATIVO" | "BLOQUEADO_PAGAMENTO";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };
type Body = {
  user_id?: string;
  payment_status?: PaymentStatus;
  reason?: string | null;
  amount?: number | null;
  due_date?: string | null;
};

const N8N_PAYMENT_WEBHOOK_URL = "https://n8n-n8n.ynlng8.easypanel.host/webhook/pagamento";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
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

    const notificationTitle = payment_status === "BLOQUEADO_PAGAMENTO" ? "Pagamento bloqueado" : "Pagamento liberado";
    const notificationMessage = payment_status === "BLOQUEADO_PAGAMENTO"
      ? `Seu cadastro foi bloqueado por pagamento.${reason ? ` Motivo: ${reason}` : ""}`
      : "Seu cadastro foi liberado na verificacao de pagamento.";
    try {
      await insertNotification({
        church_totvs_id: String(target.default_totvs_id || session.active_totvs_id || ""),
        user_id: String(target.id || ""),
        type: "payment_status_changed",
        title: notificationTitle,
        message: notificationMessage,
      });
      await sendInternalPushNotification({
        title: notificationTitle,
        body: notificationMessage,
        url: "/usuario",
        user_ids: [String(target.id || "")],
        totvs_ids: [String(target.default_totvs_id || session.active_totvs_id || "")],
        data: { user_id: String(target.id || ""), payment_status },
      });
    } catch {
      // Comentario: falha de notificacao nao pode impedir a mudanca de status.
    }

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
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
