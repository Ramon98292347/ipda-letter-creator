import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({})) as {
      cpf?: string;
      full_name?: string;
      phone?: string | null;
      email?: string | null;
      password?: string;
      totvs_id?: string;
    };

    const cpf = onlyDigits(body.cpf || "");
    const fullName = String(body.full_name || "").trim();
    const password = String(body.password || "");
    const totvsId = String(body.totvs_id || "").trim();
    const phone = normalizePhone(body.phone);
    const email = normalizeEmail(body.email);

    if (cpf.length !== 11) return json({ ok: false, error: "invalid_cpf" }, 400);
    if (!fullName) return json({ ok: false, error: "missing_full_name" }, 400);
    if (!totvsId) return json({ ok: false, error: "missing_totvs_id" }, 400);
    if (password.length < 6) return json({ ok: false, error: "password_too_short", detail: "A senha deve ter ao menos 6 caracteres." }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

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
        detail: "Sua igreja nao existe no cadastro. Peça ao pastor para cadastrar primeiro.",
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

    const totvsAccess = [
      {
        totvs_id: totvsId,
        role: "obreiro",
        registration_status: "PENDENTE",
      },
    ];

    const { data: inserted, error: insertError } = await sb
      .from("users")
      .insert({
        cpf,
        full_name: fullName,
        role: "obreiro",
        minister_role: "Membro",
        phone,
        email,
        password_hash: passwordHash,
        default_totvs_id: totvsId,
        totvs_access: totvsAccess,
        is_active: true,
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
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
