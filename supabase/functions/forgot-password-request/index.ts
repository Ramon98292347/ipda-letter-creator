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
    if (error) return json({ ok: false, error: "db_error_user", details: error.message }, 500);

    // Comentario: resposta sempre igual para nao expor se usuario existe.
    const response = {
      ok: true,
      message: "Se existir cadastro, voce recebera as orientacoes de recuperacao.",
    };

    if (!user) return json(response, 200);

    const webhookUrl = Deno.env.get("N8N_FORGOT_PASSWORD_WEBHOOK_URL")
      || "https://n8n-n8n.ynlng8.easypanel.host/webhook/senha";

    const payload = {
      action: "forgot_password_request",
      requested_at: new Date().toISOString(),
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
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
