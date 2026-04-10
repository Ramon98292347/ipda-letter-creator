/**
 * generate-church-contrato-pdf
 * ============================
 * O que faz: Dispara o webhook n8n (N8N_CONTRATO_WEBHOOK_URL) para gerar o PDF do contrato
 *            da igreja, enviando os dados do contrato e do laudo armazenados no banco.
 *            Atualiza o status do contrato para "GERANDO" antes de chamar o webhook.
 * Para que serve: Usada pelo admin/pastor quando deseja (re)gerar o PDF do contrato da igreja.
 * Quem pode usar: admin, pastor
 * Recebe: { church_totvs_id: string }
 * Retorna: { ok, n8n: { ok, status, response } }
 * Observações: Requer que o contrato já exista na tabela church_contratos.
 *              O laudo da tabela church_laudos é incluído no payload, se existir.
 *              A variável de ambiente N8N_CONTRATO_WEBHOOK_URL deve estar configurada.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

const WEBHOOK_URL = Deno.env.get("N8N_CONTRATO_WEBHOOK_URL") || "";

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

    const body = (await req.json().catch(() => ({}))) as { church_totvs_id?: string };
    const churchTotvsId = String(body.church_totvs_id || "").trim();
    if (!churchTotvsId) return json({ ok: false, error: "missing_church_totvs_id" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
    const [{ data: contrato, error: contratoErr }, { data: laudo, error: laudoErr }] = await Promise.all([
      sb.from("church_contratos").select("id,payload,status").eq("church_totvs_id", churchTotvsId).maybeSingle(),
      sb.from("church_laudos").select("id,payload").eq("church_totvs_id", churchTotvsId).maybeSingle(),
    ]);
    if (contratoErr) return json({ ok: false, error: "db_error_contrato", details: "erro interno" }, 500);
    if (laudoErr) return json({ ok: false, error: "db_error_laudo", details: "erro interno" }, 500);
    if (!contrato) return json({ ok: false, error: "contrato_not_found" }, 404);

    await sb
      .from("church_contratos")
      .update({ status: "GERANDO", updated_by_user_id: session.user_id })
      .eq("id", contrato.id);

    if (!WEBHOOK_URL) {
      return json({ ok: false, error: "missing_n8n_webhook", detail: "Configure N8N_CONTRATO_WEBHOOK_URL." }, 500);
    }

    const payload = {
      action: "create_contrato",
      church_totvs_id: churchTotvsId,
      contrato_id: contrato.id,
      contrato: contrato.payload || {},
      laudo: laudo?.payload || {},
      requested_by_user_id: session.user_id,
    };

    let n8nStatus = 0;
    let n8nOk = false;
    let n8nResponse: unknown = null;
    try {
      const resp = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      n8nStatus = resp.status;
      const text = await resp.text();
      try {
        n8nResponse = JSON.parse(text);
      } catch {
        n8nResponse = { raw: text };
      }
      n8nOk = resp.ok;
    } catch (err) {
      n8nResponse = { error: String(err) };
    }

    return json({ ok: true, n8n: { ok: n8nOk, status: n8nStatus, response: n8nResponse } }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
