/**
 * upsert-church-contrato
 * ======================
 * O que faz: Salva (cria ou atualiza) os dados do contrato de uma igreja na tabela
 *            church_contratos. O status é definido como "FINALIZADO" ao salvar.
 *            O body inteiro é armazenado no campo payload (JSON livre).
 * Para que serve: Usada pelo formulário de contrato no front-end para salvar o rascunho
 *                 ou a versão final dos dados antes de gerar o PDF.
 * Quem pode usar: admin, pastor
 * Recebe: { church_totvs_id: string, ...demais campos do formulário de contrato }
 *         (todos os campos do body são salvos no campo payload)
 * Retorna: { ok, contrato }
 * Observações: Upsert por church_totvs_id (uma única linha por igreja).
 *              Após salvar, use generate-church-contrato-pdf para gerar o PDF via n8n.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

type Role = "admin" | "pastor" | "obreiro";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);
    if (session.role === "obreiro") return json({ ok: false, error: "forbidden" }, 403);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const churchTotvsId = String(body.church_totvs_id || "").trim();
    if (!churchTotvsId) return json({ ok: false, error: "missing_church_totvs_id" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
    const { data, error } = await sb
      .from("church_contratos")
      .upsert(
        {
          church_totvs_id: churchTotvsId,
          payload: body,
          status: "FINALIZADO",
          updated_by_user_id: session.user_id,
          created_by_user_id: session.user_id,
        },
        { onConflict: "church_totvs_id" },
      )
      .select("id,church_totvs_id,status,updated_at")
      .single();

    if (error) return json({ ok: false, error: "upsert_failed", details: "erro interno" }, 500);
    return json({ ok: true, contrato: data }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
