/**
 * update-member-avatar
 * ====================
 * O que faz: Atualiza o avatar_url de um membro recém-cadastrado pelo formulário público.
 *            Verifica que o user_id e o cpf pertencem ao mesmo registro antes de atualizar.
 * Para que serve: Usado no cadastro rápido após o upload do avatar no storage.
 *                 O avatar é enviado após o cadastro porque o path usa o ID do usuário.
 * Quem pode usar: público (sem autenticação) — protegido pela verificação user_id + cpf
 * Recebe: { user_id: string, cpf: string, avatar_url: string }
 * Retorna: { ok, avatar_url }
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
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

    if (findErr) return json({ ok: false, error: "db_error", details: "erro interno" }, 500);
    if (!user) return json({ ok: false, error: "user_not_found" }, 404);

    const { error: updateErr } = await sb
      .from("users")
      .update({ avatar_url: avatarUrl })
      .eq("id", userId);

    if (updateErr) return json({ ok: false, error: "update_failed", details: "erro interno" }, 500);

    return json({ ok: true, avatar_url: avatarUrl });
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
