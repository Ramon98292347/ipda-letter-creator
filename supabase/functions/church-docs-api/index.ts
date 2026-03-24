/**
 * church-docs-api
 * ===============
 * O que faz: Centraliza as operacoes de documentos da igreja em uma unica edge function.
 * Para que serve: Simplifica a manutencao de remanejamento, contrato e laudo sem alterar o banco.
 * Quem pode usar: admin, pastor
 * Recebe:
 *   - get-remanejamento-form: { action: "get-remanejamento-form", church_totvs_id: string }
 *   - upsert-remanejamento: { action: "upsert-remanejamento", church_totvs_id: string, hierarchy?: object, ...campos }
 *   - generate-remanejamento-pdf: { action: "generate-remanejamento-pdf", church_totvs_id: string }
 *   - get-contrato-form: { action: "get-contrato-form", church_totvs_id: string }
 *   - upsert-contrato: { action: "upsert-contrato", church_totvs_id: string, ...campos }
 *   - upsert-laudo: { action: "upsert-laudo", church_totvs_id: string, ...campos }
 *   - generate-contrato-pdf: { action: "generate-contrato-pdf", church_totvs_id: string }
 * Retorna: o mesmo contrato das functions legadas correspondentes.
 * Observacoes:
 *   - verify_jwt deve permanecer desligado no config.toml.
 *   - A propria function valida o JWT customizado.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

const REMANEJAMENTO_WEBHOOK_URL = Deno.env.get("N8N_REMANEJAMENTO_WEBHOOK_URL") || "";
const CONTRATO_WEBHOOK_URL = Deno.env.get("N8N_CONTRATO_WEBHOOK_URL") || "";

type Role = "admin" | "pastor" | "obreiro";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };
type Action =
  | "get-remanejamento-form"
  | "upsert-remanejamento"
  | "generate-remanejamento-pdf"
  | "get-contrato-form"
  | "upsert-contrato"
  | "upsert-laudo"
  | "generate-contrato-pdf";
type Body = Record<string, unknown> & { action?: Action; church_totvs_id?: string };
type ChurchRow = {
  totvs_id: string;
  parent_totvs_id: string | null;
  class: string | null;
  pastor_user_id: string | null;
  church_name: string | null;
};

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
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

async function requireSession(req: Request) {
  const session = await verifySessionJWT(req);
  if (!session) return { error: json({ ok: false, error: "unauthorized" }, 401), session: null };
  if (session.role === "obreiro") return { error: json({ ok: false, error: "forbidden" }, 403), session: null };
  return { error: null, session };
}

function computeScope(rootTotvs: string, churches: ChurchRow[]) {
  const children = new Map<string, string[]>();
  for (const church of churches) {
    const parent = String(church.parent_totvs_id || "");
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)?.push(String(church.totvs_id));
  }
  const scope = new Set<string>();
  const queue = [rootTotvs];
  while (queue.length) {
    const current = queue.shift() || "";
    if (!current || scope.has(current)) continue;
    scope.add(current);
    for (const child of children.get(current) || []) queue.push(child);
  }
  return scope;
}

function buildAncestors(targetTotvs: string, byId: Map<string, ChurchRow>) {
  const chain: ChurchRow[] = [];
  let current = byId.get(targetTotvs) || null;
  const guard = new Set<string>();
  while (current) {
    const currentId = String(current.totvs_id);
    if (guard.has(currentId)) break;
    guard.add(currentId);
    chain.push(current);
    const parent = String(current.parent_totvs_id || "");
    if (!parent) break;
    current = byId.get(parent) || null;
  }
  return chain;
}

async function ensureChurchScope(
  sb: ReturnType<typeof createClient>,
  session: SessionClaims,
  churchTotvsId: string,
) {
  const { data: churches, error: churchErr } = await sb
    .from("churches")
    .select("totvs_id,parent_totvs_id,class,pastor_user_id,church_name");
  if (churchErr) return { error: json({ ok: false, error: "db_error_churches", details: churchErr.message }, 500), byId: null };

  const allChurches = (churches || []) as ChurchRow[];
  const byId = new Map<string, ChurchRow>(allChurches.map((church) => [String(church.totvs_id), church]));
  if (!byId.has(churchTotvsId)) return { error: json({ ok: false, error: "church_not_found" }, 404), byId: null };

  if (session.role === "pastor") {
    const scope = computeScope(session.active_totvs_id, allChurches);
    if (!scope.has(churchTotvsId)) {
      return { error: json({ ok: false, error: "forbidden_wrong_scope" }, 403), byId: null };
    }
  }

  return { error: null, byId };
}

async function actionGetRemanejamentoForm(sb: ReturnType<typeof createClient>, req: Request, churchTotvsId: string) {
  const auth = await requireSession(req);
  if (auth.error || !auth.session) return auth.error!;

  const scopeResult = await ensureChurchScope(sb, auth.session, churchTotvsId);
  if (scopeResult.error || !scopeResult.byId) return scopeResult.error!;

  const chain = buildAncestors(churchTotvsId, scopeResult.byId);
  const setorial = chain.find((church) => String(church.class || "").toLowerCase() === "setorial");
  const estadual = [...chain].reverse().find((church) => String(church.class || "").toLowerCase() === "estadual");
  const signerChurch = setorial || estadual || chain[chain.length - 1];
  const signerRole = setorial ? "setorial" : "estadual";

  let signer: Record<string, unknown> = {};
  const signerId = String(signerChurch?.pastor_user_id || "");
  if (signerId) {
    const { data: signerUser } = await sb
      .from("users")
      .select("id,full_name,cpf,phone,email,address_street,address_number,address_neighborhood,address_city,address_state,signature_url")
      .eq("id", signerId)
      .maybeSingle();
    signer = signerUser || {};
  }

  const { data: remRow } = await sb
    .from("church_remanejamentos")
    .select("id,payload,hierarchy,status,pdf_storage_path")
    .eq("church_totvs_id", churchTotvsId)
    .maybeSingle();

  const targetChurch = scopeResult.byId.get(churchTotvsId);
  const draft = {
    church_totvs_id: churchTotvsId,
    estadual_pastor_nome: signerRole === "estadual" ? String(signer.full_name || "") : "",
    estadual_pastor_cpf: signerRole === "estadual" ? String(signer.cpf || "") : "",
    estadual_telefone: signerRole === "estadual" ? String(signer.phone || "") : "",
    estadual_email: signerRole === "estadual" ? String(signer.email || "") : "",
    estadual_endereco: signerRole === "estadual" ? `${String(signer.address_street || "")}, ${String(signer.address_number || "")}`.trim() : "",
    estadual_cidade: signerRole === "estadual" ? String(signer.address_city || "") : "",
    estadual_bairro: signerRole === "estadual" ? String(signer.address_neighborhood || "") : "",
    estadual_uf: signerRole === "estadual" ? String(signer.address_state || "") : "",
    estadual_assinatura_url: signerRole === "estadual" ? String(signer.signature_url || "") : "",
    setorial_pastor_nome: signerRole === "setorial" ? String(signer.full_name || "") : "",
    setorial_pastor_cpf: signerRole === "setorial" ? String(signer.cpf || "") : "",
    setorial_telefone: signerRole === "setorial" ? String(signer.phone || "") : "",
    setorial_email: signerRole === "setorial" ? String(signer.email || "") : "",
    setorial_endereco: signerRole === "setorial" ? `${String(signer.address_street || "")}, ${String(signer.address_number || "")}`.trim() : "",
    setorial_cidade: signerRole === "setorial" ? String(signer.address_city || "") : "",
    setorial_bairro: signerRole === "setorial" ? String(signer.address_neighborhood || "") : "",
    setorial_uf: signerRole === "setorial" ? String(signer.address_state || "") : "",
    setorial_assinatura_url: signerRole === "setorial" ? String(signer.signature_url || "") : "",
    igreja_cidade: String(targetChurch?.church_name || ""),
    ...(remRow?.payload || {}),
  };

  const hierarchy = {
    requires_setorial_signature: Boolean(setorial),
    signer_role: signerRole,
    signer_user_id: signerId || null,
    signer_name: String(signer.full_name || ""),
    signer_signature_url: String(signer.signature_url || ""),
    message: setorial
      ? "Esta igreja precisa da assinatura do Pastor Setorial."
      : "Esta igreja esta ligada diretamente a Estadual. A assinatura setorial nao e necessaria.",
    ...(remRow?.hierarchy || {}),
  };

  return json({
    ok: true,
    draft,
    hierarchy,
    status: remRow?.status || "RASCUNHO",
    pdf_storage_path: remRow?.pdf_storage_path || null,
  });
}

async function actionUpsertRemanejamento(sb: ReturnType<typeof createClient>, req: Request, body: Body, churchTotvsId: string) {
  const auth = await requireSession(req);
  if (auth.error || !auth.session) return auth.error!;

  const scopeResult = await ensureChurchScope(sb, auth.session, churchTotvsId);
  if (scopeResult.error) return scopeResult.error;

  const hierarchy = body.hierarchy && typeof body.hierarchy === "object" ? body.hierarchy : {};
  const { data, error } = await sb
    .from("church_remanejamentos")
    .upsert(
      {
        church_totvs_id: churchTotvsId,
        payload: body,
        hierarchy,
        status: "FINALIZADO",
        updated_by_user_id: auth.session.user_id,
        created_by_user_id: auth.session.user_id,
      },
      { onConflict: "church_totvs_id" },
    )
    .select("id,church_totvs_id,status,updated_at")
    .single();

  if (error) return json({ ok: false, error: "upsert_failed", details: error.message }, 500);
  return json({ ok: true, remanejamento: data }, 200);
}

async function actionGenerateRemanejamentoPdf(sb: ReturnType<typeof createClient>, req: Request, churchTotvsId: string) {
  const auth = await requireSession(req);
  if (auth.error || !auth.session) return auth.error!;

  const scopeResult = await ensureChurchScope(sb, auth.session, churchTotvsId);
  if (scopeResult.error) return scopeResult.error;

  const { data: rem, error } = await sb
    .from("church_remanejamentos")
    .select("id,payload,hierarchy,status")
    .eq("church_totvs_id", churchTotvsId)
    .maybeSingle();
  if (error) return json({ ok: false, error: "db_error_remanejamento", details: error.message }, 500);
  if (!rem) return json({ ok: false, error: "remanejamento_not_found" }, 404);

  await sb.from("church_remanejamentos").update({ status: "GERANDO", updated_by_user_id: auth.session.user_id }).eq("id", rem.id);

  if (!REMANEJAMENTO_WEBHOOK_URL) {
    return json({ ok: false, error: "missing_n8n_webhook", detail: "Configure N8N_REMANEJAMENTO_WEBHOOK_URL." }, 500);
  }

  const payload = {
    action: "create_remanejamento",
    church_totvs_id: churchTotvsId,
    remanejamento_id: rem.id,
    dados: rem.payload || {},
    hierarchy: rem.hierarchy || {},
    requested_by_user_id: auth.session.user_id,
  };

  let n8nStatus = 0;
  let n8nOk = false;
  let n8nResponse: unknown = null;
  try {
    const resp = await fetch(REMANEJAMENTO_WEBHOOK_URL, {
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
}

async function actionGetContratoForm(sb: ReturnType<typeof createClient>, req: Request, churchTotvsId: string) {
  const auth = await requireSession(req);
  if (auth.error || !auth.session) return auth.error!;

  const scopeResult = await ensureChurchScope(sb, auth.session, churchTotvsId);
  if (scopeResult.error) return scopeResult.error;

  const { data: church, error: churchErr } = await sb
    .from("churches")
    .select("totvs_id,church_name,parent_totvs_id")
    .eq("totvs_id", churchTotvsId)
    .maybeSingle();
  if (churchErr) return json({ ok: false, error: "db_error_church", details: churchErr.message }, 500);
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
}

async function actionUpsertContrato(sb: ReturnType<typeof createClient>, req: Request, body: Body, churchTotvsId: string) {
  const auth = await requireSession(req);
  if (auth.error || !auth.session) return auth.error!;

  const scopeResult = await ensureChurchScope(sb, auth.session, churchTotvsId);
  if (scopeResult.error) return scopeResult.error;

  const { data, error } = await sb
    .from("church_contratos")
    .upsert(
      {
        church_totvs_id: churchTotvsId,
        payload: body,
        status: "FINALIZADO",
        updated_by_user_id: auth.session.user_id,
        created_by_user_id: auth.session.user_id,
      },
      { onConflict: "church_totvs_id" },
    )
    .select("id,church_totvs_id,status,updated_at")
    .single();

  if (error) return json({ ok: false, error: "upsert_failed", details: error.message }, 500);
  return json({ ok: true, contrato: data }, 200);
}

async function actionUpsertLaudo(sb: ReturnType<typeof createClient>, req: Request, body: Body, churchTotvsId: string) {
  const auth = await requireSession(req);
  if (auth.error || !auth.session) return auth.error!;

  const scopeResult = await ensureChurchScope(sb, auth.session, churchTotvsId);
  if (scopeResult.error) return scopeResult.error;

  const { data, error } = await sb
    .from("church_laudos")
    .upsert(
      {
        church_totvs_id: churchTotvsId,
        payload: body,
        updated_by_user_id: auth.session.user_id,
        created_by_user_id: auth.session.user_id,
      },
      { onConflict: "church_totvs_id" },
    )
    .select("id,church_totvs_id,updated_at")
    .single();

  if (error) return json({ ok: false, error: "upsert_failed", details: error.message }, 500);
  return json({ ok: true, laudo: data }, 200);
}

async function actionGenerateContratoPdf(sb: ReturnType<typeof createClient>, req: Request, churchTotvsId: string) {
  const auth = await requireSession(req);
  if (auth.error || !auth.session) return auth.error!;

  const scopeResult = await ensureChurchScope(sb, auth.session, churchTotvsId);
  if (scopeResult.error) return scopeResult.error;

  const [{ data: contrato, error: contratoErr }, { data: laudo, error: laudoErr }] = await Promise.all([
    sb.from("church_contratos").select("id,payload,status").eq("church_totvs_id", churchTotvsId).maybeSingle(),
    sb.from("church_laudos").select("id,payload").eq("church_totvs_id", churchTotvsId).maybeSingle(),
  ]);
  if (contratoErr) return json({ ok: false, error: "db_error_contrato", details: contratoErr.message }, 500);
  if (laudoErr) return json({ ok: false, error: "db_error_laudo", details: laudoErr.message }, 500);
  if (!contrato) return json({ ok: false, error: "contrato_not_found" }, 404);

  await sb.from("church_contratos").update({ status: "GERANDO", updated_by_user_id: auth.session.user_id }).eq("id", contrato.id);

  if (!CONTRATO_WEBHOOK_URL) {
    return json({ ok: false, error: "missing_n8n_webhook", detail: "Configure N8N_CONTRATO_WEBHOOK_URL." }, 500);
  }

  const payload = {
    action: "create_contrato",
    church_totvs_id: churchTotvsId,
    contrato_id: contrato.id,
    contrato: contrato.payload || {},
    laudo: laudo?.payload || {},
    requested_by_user_id: auth.session.user_id,
  };

  let n8nStatus = 0;
  let n8nOk = false;
  let n8nResponse: unknown = null;
  try {
    const resp = await fetch(CONTRATO_WEBHOOK_URL, {
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
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const action = String(body.action || "").trim() as Action;
    const churchTotvsId = String(body.church_totvs_id || "").trim();
    const sb = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

    if (!churchTotvsId) return json({ ok: false, error: "missing_church_totvs_id" }, 400);

    if (action === "get-remanejamento-form") return await actionGetRemanejamentoForm(sb, req, churchTotvsId);
    if (action === "upsert-remanejamento") return await actionUpsertRemanejamento(sb, req, body, churchTotvsId);
    if (action === "generate-remanejamento-pdf") return await actionGenerateRemanejamentoPdf(sb, req, churchTotvsId);
    if (action === "get-contrato-form") return await actionGetContratoForm(sb, req, churchTotvsId);
    if (action === "upsert-contrato") return await actionUpsertContrato(sb, req, body, churchTotvsId);
    if (action === "upsert-laudo") return await actionUpsertLaudo(sb, req, body, churchTotvsId);
    if (action === "generate-contrato-pdf") return await actionGenerateContratoPdf(sb, req, churchTotvsId);

    return json({
      ok: false,
      error: "invalid_action",
      allowed: [
        "get-remanejamento-form",
        "upsert-remanejamento",
        "generate-remanejamento-pdf",
        "get-contrato-form",
        "upsert-contrato",
        "upsert-laudo",
        "generate-contrato-pdf",
      ],
    }, 400);
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
