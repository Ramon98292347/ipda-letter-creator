/**
 * forgot-password-request
 * =======================
 * O que faz: Inicia o fluxo de recuperação de senha: busca o usuário por CPF ou e-mail,
 *            gera um token seguro (SHA-256), salva na tabela password_resets com validade de
 *            15 minutos e dispara o webhook n8n para envio do link de redefinição.
 * Para que serve: Chamada pela tela de "Esqueci minha senha" do front-end.
 * Quem pode usar: público (sem autenticação)
 * Recebe: { cpf?: string, email?: string } (pelo menos um dos dois)
 * Retorna: { ok, message } — resposta sempre igual para não expor se o usuário existe.
 * Observações: Endpoint público, sem JWT. O token expira em 15 minutos.
 *              A URL de redefinição usa APP_BASE_URL do ambiente.
 *              O webhook (N8N_FORGOT_PASSWORD_WEBHOOK_URL) envia o link por e-mail/WhatsApp.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function normalizeEmail(value: string) {
  return String(value || "").trim().toLowerCase();
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({})) as { cpf?: string; email?: string };
    const cpf = onlyDigits(body.cpf || "");
    const email = normalizeEmail(body.email || "");

    if (cpf.length !== 11 && !email) {
      return json({ ok: false, error: "missing_identifier", detail: "Informe CPF ou e-mail." }, 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    let query = sb
      .from("users")
      .select("id, full_name, cpf, email, phone, default_totvs_id, role, is_active")
      .limit(1);

    if (cpf.length === 11) {
      query = query.eq("cpf", cpf);
    } else {
      query = query.ilike("email", email);
    }

    const { data: user, error } = await query.maybeSingle();
    if (error) return json({ ok: false, error: "db_error_user", details: "erro interno" }, 500);

    // Comentario: resposta sempre igual para nao expor se usuario existe.
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

    if (resetErr) return json({ ok: false, error: "db_error_password_reset", details: "erro interno" }, 500);

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
      // Comentario: nao quebra fluxo para o usuario final.
    }

    return json(response, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
