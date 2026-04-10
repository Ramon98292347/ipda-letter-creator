/**
 * upsert-church-remanejamento
 * ===========================
 * O que faz: Salva (cria ou atualiza) os dados do formulário de remanejamento de uma igreja
 *            na tabela church_remanejamentos. O body inteiro é armazenado no campo payload
 *            (JSON livre) e o objeto hierarchy é salvo em campo separado. Status definido
 *            como "FINALIZADO" ao salvar.
 * Para que serve: Usada pelo formulário de remanejamento no front-end para salvar os dados
 *                 antes de gerar o PDF via generate-church-remanejamento-pdf.
 * Quem pode usar: admin, pastor
 * Recebe: { church_totvs_id: string, hierarchy: object, ...demais campos do formulário }
 *         (todos os campos do body são salvos no campo payload; hierarchy também é salvo
 *          em campo dedicado para facilitar consultas)
 * Retorna: { ok, remanejamento }
 * Observações: Upsert por church_totvs_id (uma única linha por igreja).
 *              O campo hierarchy armazena info sobre o signatário (setorial vs estadual).
 *              Após salvar, use generate-church-remanejamento-pdf para acionar o n8n e gerar o PDF.
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
    const hierarchy = body.hierarchy && typeof body.hierarchy === "object" ? body.hierarchy : {};

    const { data, error } = await sb
      .from("church_remanejamentos")
      .upsert(
        {
          church_totvs_id: churchTotvsId,
          payload: body,
          hierarchy,
          status: "FINALIZADO",
          updated_by_user_id: session.user_id,
          created_by_user_id: session.user_id,
        },
        { onConflict: "church_totvs_id" },
      )
      .select("id,church_totvs_id,status,updated_at")
      .single();

    if (error) return json({ ok: false, error: "upsert_failed", details: "erro interno" }, 500);
    return json({ ok: true, remanejamento: data }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
