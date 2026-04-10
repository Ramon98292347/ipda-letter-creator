/**
 * get-church-contrato-form
 * ========================
 * O que faz: Retorna os dados do formulário de contrato de uma igreja (draft preenchido com dados
 *            salvos), junto com os dados do laudo e o status atual do contrato.
 * Para que serve: Usada pelo front-end para pré-preencher o formulário de edição do contrato
 *                 da igreja antes de enviar para o n8n gerar o PDF.
 * Quem pode usar: admin, pastor
 * Recebe: { church_totvs_id: string }
 * Retorna: { ok, draft, laudo, status, pdf_storage_path }
 * Observações: Se o contrato não existir, retorna { ok: false, error: "contrato_not_found" }.
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

    const body = (await req.json().catch(() => ({}))) as { church_totvs_id?: string };
    const churchTotvsId = String(body.church_totvs_id || "").trim();
    if (!churchTotvsId) return json({ ok: false, error: "missing_church_totvs_id" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
    const { data: church, error: churchErr } = await sb
      .from("churches")
      .select("totvs_id,church_name,parent_totvs_id")
      .eq("totvs_id", churchTotvsId)
      .maybeSingle();
    if (churchErr) return json({ ok: false, error: "db_error_church", details: "erro interno" }, 500);
    if (!church) return json({ ok: false, error: "church_not_found" }, 404);

    const [{ data: contrato }, { data: laudo }] = await Promise.all([
      sb.from("church_contratos").select("id,payload,status,pdf_storage_path").eq("church_totvs_id", churchTotvsId).maybeSingle(),
      sb.from("church_laudos").select("id,payload").eq("church_totvs_id", churchTotvsId).maybeSingle(),
    ]);

    const draft = {
      church_totvs_id: churchTotvsId,
      dirigente_igreja: String(church.church_name || ""),
      ...(contrato?.payload || {}),
    };
    const laudoDraft = {
      church_totvs_id: churchTotvsId,
      totvs: churchTotvsId,
      ...(laudo?.payload || {}),
    };

    return json({
      ok: true,
      draft,
      laudo: laudoDraft,
      status: contrato?.status || "RASCUNHO",
      pdf_storage_path: contrato?.pdf_storage_path || null,
    });
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
