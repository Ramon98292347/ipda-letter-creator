/**
 * reset-password-confirm
 * ======================
 * O que faz: Conclui o fluxo de redefinição de senha: valida o token recebido (hash SHA-256),
 *            verifica a expiração (15 minutos), atualiza a senha do usuário com novo hash bcrypt
 *            e marca o token como usado (used_at).
 * Para que serve: Chamado pela tela de "Redefinir senha" após o usuário clicar no link enviado
 *                 por e-mail/WhatsApp pelo fluxo de forgot-password-request.
 * Quem pode usar: público (sem autenticação, autenticado apenas pelo token de reset)
 * Recebe: { token: string, new_password: string } (senha mínima de 6 caracteres)
 * Retorna: { ok, message }
 * Observações: O token só pode ser usado uma vez (used_at é setado após uso).
 *              Token expirado ou já usado retorna { error: "invalid_or_expired_token" }.
 */
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

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashToken(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(digest);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({})) as { token?: string; new_password?: string };
    const token = String(body.token || "").trim();
    const newPassword = String(body.new_password || "");

    if (!token) return json({ ok: false, error: "missing_token" }, 400);
    if (newPassword.length < 6) {
      return json({ ok: false, error: "password_too_short", detail: "A senha precisa ter pelo menos 6 caracteres." }, 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const tokenHash = await hashToken(token);

    const { data: resetRows, error: resetErr } = await sb
      .from("password_resets")
      .select("id, user_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (resetErr) return json({ ok: false, error: "db_error_password_reset", details: "erro interno" }, 500);
    if (!resetRows || resetRows.length === 0) return json({ ok: false, error: "invalid_or_expired_token" }, 400);

    const resetRow = resetRows[0] as { id: string; user_id: string; expires_at: string; used_at: string | null };
    const expiresAt = new Date(String(resetRow.expires_at || ""));
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      return json({ ok: false, error: "invalid_or_expired_token" }, 400);
    }

    const password_hash = bcrypt.hashSync(newPassword, 10);

    const { error: userErr } = await sb
      .from("users")
      .update({ password_hash })
      .eq("id", resetRow.user_id);

    if (userErr) return json({ ok: false, error: "db_error_update_password", details: "erro interno" }, 500);

    const { error: usedErr } = await sb
      .from("password_resets")
      .update({ used_at: new Date().toISOString() })
      .eq("id", resetRow.id);

    if (usedErr) return json({ ok: false, error: "db_error_mark_used", details: "erro interno" }, 500);

    return json({ ok: true, message: "Senha redefinida com sucesso." }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
