/**
 * mark-all-notifications-read
 * ============================
 * O que faz: Exclui (deleta) todas as notificações da igreja ativa e as notificações individuais
 *            do usuário logado de uma vez (equivale a "limpar tudo" no sininho).
 * Para que serve: Acionado pelo botão "Limpar notificações" no front-end.
 * Quem pode usar: admin, pastor, obreiro
 * Recebe: (nenhum campo no body)
 * Retorna: { ok, deleted: number }
 * Observações: A ação deleta as notificações permanentemente do banco.
 *              Notificações da igreja ativa (church_totvs_id) e do usuário (user_id) são removidas.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

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

type Role = "admin" | "pastor" | "obreiro";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };

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

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    // Comentario: "Limpar notificacoes" remove do sininho.
    // Regra: deleta todas as notificacoes da igreja ativa + individuais do usuario.
    const [{ data: churchRows, error: churchErr }, { data: userRows, error: userErr }] = await Promise.all([
      sb.from("notifications").select("id").eq("church_totvs_id", session.active_totvs_id),
      sb.from("notifications").select("id").eq("user_id", session.user_id),
    ]);

    if (churchErr) return json({ ok: false, error: "db_error_list_church", details: "erro interno" }, 500);
    if (userErr) return json({ ok: false, error: "db_error_list_user", details: "erro interno" }, 500);

    const ids = new Set<string>();
    for (const r of churchRows || []) ids.add(String((r as Record<string, unknown>).id || ""));
    for (const r of userRows || []) ids.add(String((r as Record<string, unknown>).id || ""));
    const idList = [...ids].filter(Boolean);

    if (idList.length === 0) return json({ ok: true, deleted: 0 }, 200);

    const { error: delErr } = await sb.from("notifications").delete().in("id", idList);
    if (delErr) return json({ ok: false, error: "db_error_delete", details: "erro interno" }, 500);

    return json({ ok: true, deleted: idList.length }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
