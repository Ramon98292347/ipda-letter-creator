/**
 * church-docs-api
 * ===============
 * O que faz: Centraliza as operacoes de documentos da igreja em uma unica edge function.
 * Para que serve: Simplifica a manutencao de remanejamento, contrato e laudo sem alterar o banco.
 * Quem pode usar: admin, pastor
 * Recebe:
 *   - get-remanejamento-form: { action: "get-remanejamento-form", church_totvs_id: string }
 *   - upsert-remanejamento: { action: "upsert-remanejamento", church_totvs_id: string, hierarchy?: object, ...campos }
 *   - delete-remanejamento: { action: "delete-remanejamento", church_totvs_id: string }
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

const REMANEJAMENTO_WEBHOOK_URL =
  Deno.env.get("N8N_REMANEJAMENTO_WEBHOOK_URL") ||
  "https://n8n-n8n.ynlng8.easypanel.host/webhook/remanejamento";
const CONTRATO_WEBHOOK_URL = Deno.env.get("N8N_CONTRATO_WEBHOOK_URL") || "";

type Role = "admin" | "pastor" | "obreiro";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };
type Action =
  | "get-remanejamento-form"
  | "upsert-remanejamento"
  | "delete-remanejamento"
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
  address_street: string | null;
  address_number: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
};

function extractPdfUrl(payload: unknown): string {
  const queue: unknown[] = [payload];
  const seen = new Set<unknown>();
  const directKeys = ["pdf_storage_path", "pdf_url", "url", "public_url", "file_url", "download_url"];
  while (queue.length) {
    const item = queue.shift();
    if (!item || typeof item !== "object") continue;
    if (seen.has(item)) continue;
    seen.add(item);
    const rec = item as Record<string, unknown>;
    for (const key of directKeys) {
      const value = rec[key];
      if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) return value.trim();
    }
    for (const value of Object.values(rec)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }
  return "";
}

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
    .select("totvs_id,parent_totvs_id,class,pastor_user_id,church_name,address_street,address_number,address_neighborhood,address_city,address_state");
  if (churchErr) return { error: json({ ok: false, error: "db_error_churches", details: "erro interno" }, 500), byId: null };

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

async function buildRemanejamentoPrefill(
  sb: ReturnType<typeof createClient>,
  churchTotvsId: string,
  byId: Map<string, ChurchRow>,
) {
  const chain = buildAncestors(churchTotvsId, byId);
  const setorial = chain.find((church) => String(church.class || "").toLowerCase() === "setorial") || null;
  const estadual = [...chain].reverse().find((church) => String(church.class || "").toLowerCase() === "estadual") || null;

  const estadualSignerId = String(estadual?.pastor_user_id || "").trim();
  const setorialSignerId = String(setorial?.pastor_user_id || "").trim();

  const [estadualSignerRes, setorialSignerRes] = await Promise.all([
    estadualSignerId
      ? sb
          .from("users")
          .select("id,full_name,cpf,phone,email,address_street,address_number,address_neighborhood,address_city,address_state,signature_url")
          .eq("id", estadualSignerId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    setorialSignerId
      ? sb
          .from("users")
          .select("id,full_name,cpf,phone,email,address_street,address_number,address_neighborhood,address_city,address_state,signature_url")
          .eq("id", setorialSignerId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const estadualSigner = (estadualSignerRes.data || {}) as Record<string, unknown>;
  const setorialSigner = (setorialSignerRes.data || {}) as Record<string, unknown>;
  const targetChurch = byId.get(churchTotvsId);

  const draft = {
    church_totvs_id: churchTotvsId,
    estadual_pastor_nome: String(estadualSigner.full_name || ""),
    estadual_pastor_cpf: String(estadualSigner.cpf || ""),
    estadual_telefone: String(estadualSigner.phone || ""),
    estadual_email: String(estadualSigner.email || ""),
    estadual_endereco: `${String(estadualSigner.address_street || "")}, ${String(estadualSigner.address_number || "")}`.trim(),
    estadual_cidade: String(estadualSigner.address_city || ""),
    estadual_bairro: String(estadualSigner.address_neighborhood || ""),
    estadual_uf: String(estadualSigner.address_state || ""),
    estadual_assinatura_url: String(estadualSigner.signature_url || ""),
    setorial_pastor_nome: String(setorialSigner.full_name || ""),
    setorial_pastor_cpf: String(setorialSigner.cpf || ""),
    setorial_telefone: String(setorialSigner.phone || ""),
    setorial_email: String(setorialSigner.email || ""),
    setorial_endereco: `${String(setorialSigner.address_street || "")}, ${String(setorialSigner.address_number || "")}`.trim(),
    setorial_cidade: String(setorialSigner.address_city || ""),
    setorial_bairro: String(setorialSigner.address_neighborhood || ""),
    setorial_uf: String(setorialSigner.address_state || ""),
    setorial_assinatura_url: String(setorialSigner.signature_url || ""),
    igreja_endereco_atual: String(targetChurch?.address_street || ""),
    igreja_numero: String(targetChurch?.address_number || ""),
    igreja_bairro: String(targetChurch?.address_neighborhood || ""),
    igreja_cidade: String(targetChurch?.address_city || ""),
    igreja_uf: String(targetChurch?.address_state || ""),
  };

  const hierarchy = {
    requires_setorial_signature: Boolean(setorial),
    signer_role: setorial ? "setorial" : "estadual",
    signer_user_id: setorial ? setorialSignerId || null : estadualSignerId || null,
    signer_name: setorial ? String(setorialSigner.full_name || "") : String(estadualSigner.full_name || ""),
    signer_signature_url: setorial ? String(setorialSigner.signature_url || "") : String(estadualSigner.signature_url || ""),
    message: setorial
      ? "Esta igreja precisa da assinatura do Pastor Setorial."
      : "Esta igreja esta ligada diretamente a Estadual. A assinatura setorial nao e necessaria.",
  };

  return { draft, hierarchy };
}

async function actionGetRemanejamentoForm(sb: ReturnType<typeof createClient>, req: Request, churchTotvsId: string) {
  const auth = await requireSession(req);
  if (auth.error || !auth.session) return auth.error!;

  const scopeResult = await ensureChurchScope(sb, auth.session, churchTotvsId);
  if (scopeResult.error || !scopeResult.byId) return scopeResult.error!;
  const prefill = await buildRemanejamentoPrefill(sb, churchTotvsId, scopeResult.byId);

  const { data: remRow } = await sb
    .from("church_remanejamentos")
    .select("id,payload,hierarchy,status,pdf_storage_path")
    .eq("church_totvs_id", churchTotvsId)
    .maybeSingle();

  const draft = {
    ...prefill.draft,
    ...(remRow?.payload || {}),
  };

  const hierarchy = {
    ...prefill.hierarchy,
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

  if (error) return json({ ok: false, error: "upsert_failed", details: "erro interno" }, 500);
  return json({ ok: true, remanejamento: data }, 200);
}

async function actionDeleteRemanejamento(sb: ReturnType<typeof createClient>, req: Request, churchTotvsId: string) {
  const auth = await requireSession(req);
  if (auth.error || !auth.session) return auth.error!;

  const scopeResult = await ensureChurchScope(sb, auth.session, churchTotvsId);
  if (scopeResult.error) return scopeResult.error;

  const { error } = await sb
    .from("church_remanejamentos")
    .delete()
    .eq("church_totvs_id", churchTotvsId);

  if (error) return json({ ok: false, error: "delete_failed", details: "erro interno" }, 500);
  return json({ ok: true }, 200);
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
  if (error) return json({ ok: false, error: "db_error_remanejamento", details: "erro interno" }, 500);
  let remData = rem;
  if (!remData) {
    if (!scopeResult.byId) return json({ ok: false, error: "scope_byid_missing" }, 500);
    const prefill = await buildRemanejamentoPrefill(sb, churchTotvsId, scopeResult.byId);
    const createRes = await sb
      .from("church_remanejamentos")
      .upsert(
        {
          church_totvs_id: churchTotvsId,
          payload: prefill.draft,
          hierarchy: prefill.hierarchy,
          status: "FINALIZADO",
          updated_by_user_id: auth.session.user_id,
          created_by_user_id: auth.session.user_id,
        },
        { onConflict: "church_totvs_id" },
      )
      .select("id,payload,hierarchy,status")
      .single();
    if (createRes.error) return json({ ok: false, error: "create_remanejamento_failed", details: "erro interno" }, 500);
    remData = createRes.data;
  }

  await sb.from("church_remanejamentos").update({ status: "GERANDO", updated_by_user_id: auth.session.user_id }).eq("id", remData.id);

  if (!REMANEJAMENTO_WEBHOOK_URL) {
    return json({ ok: false, error: "missing_n8n_webhook", detail: "Configure N8N_REMANEJAMENTO_WEBHOOK_URL." }, 500);
  }

  const dados = (remData.payload || {}) as Record<string, unknown>;
  const igrejaAtual = scopeResult.byId?.get(churchTotvsId) || null;
  const estadual = {
    pastor_nome: String(dados.estadual_pastor_nome || ""),
    pastor_cpf: String(dados.estadual_pastor_cpf || ""),
    telefone: String(dados.estadual_telefone || ""),
    email: String(dados.estadual_email || ""),
    endereco: String(dados.estadual_endereco || ""),
    cidade: String(dados.estadual_cidade || ""),
    bairro: String(dados.estadual_bairro || ""),
    uf: String(dados.estadual_uf || ""),
    assinatura_url: String(dados.estadual_assinatura_url || ""),
  };
  const setorial = {
    pastor_nome: String(dados.setorial_pastor_nome || ""),
    pastor_cpf: String(dados.setorial_pastor_cpf || ""),
    telefone: String(dados.setorial_telefone || ""),
    email: String(dados.setorial_email || ""),
    endereco: String(dados.setorial_endereco || ""),
    cidade: String(dados.setorial_cidade || ""),
    bairro: String(dados.setorial_bairro || ""),
    uf: String(dados.setorial_uf || ""),
    assinatura_url: String(dados.setorial_assinatura_url || ""),
  };
  const igreja = {
    totvs_id: churchTotvsId,
    nome: String(igrejaAtual?.church_name || ""),
    endereco: String(dados.igreja_endereco_atual || ""),
    numero: String(dados.igreja_numero || ""),
    bairro: String(dados.igreja_bairro || ""),
    cidade: String(dados.igreja_cidade || ""),
    uf: String(dados.igreja_uf || ""),
    porte: String(dados.porte_igreja || ""),
    sobre_imovel: String(dados.sobre_imovel || ""),
    contrato_vence_em: String(dados.contrato_vence_em || ""),
    valor_aluguel: String(dados.valor_aluguel || ""),
    possui_escritura: String(dados.possui_escritura || ""),
    comodato: String(dados.comodato || ""),
    entradas_atuais: String(dados.entradas_atuais || ""),
    saidas: String(dados.saidas || ""),
    saldo: String(dados.saldo || ""),
    numero_membros: String(dados.numero_membros || ""),
    motivo_troca: String(dados.motivo_troca || ""),
  };
  const dirigenteQueDeixa = {
    tipo_ministerial: String(dados.dirigente_saida_tipo || ""),
    assumiu_em: String(dados.dirigente_saida_data_assumiu || ""),
    nome: String(dados.dirigente_saida_nome || ""),
    rg: String(dados.dirigente_saida_rg || ""),
    cpf: String(dados.dirigente_saida_cpf || ""),
    telefone: String(dados.dirigente_saida_telefone || ""),
  };
  const novoDirigente = {
    tipo_ministerial: String(dados.novo_dirigente_tipo || ""),
    data_batismo: String(dados.novo_dirigente_data_batismo || ""),
    nome: String(dados.novo_dirigente_nome || ""),
    rg: String(dados.novo_dirigente_rg || ""),
    cpf: String(dados.novo_dirigente_cpf || ""),
    telefone: String(dados.novo_dirigente_telefone || ""),
    distancia_km: String(dados.novo_dirigente_distancia_km || ""),
    recebe_prebenda: String(dados.novo_dirigente_recebe_prebenda || ""),
    prebenda_desde: String(dados.novo_dirigente_prebenda_desde || ""),
  };

  const payload = {
    action: "create_remanejamento",
    church_totvs_id: churchTotvsId,
    remanejamento_id: remData.id,
    estadual,
    setorial,
    igreja,
    dirigente_que_deixa: dirigenteQueDeixa,
    novo_dirigente: novoDirigente,
    hierarchy: remData.hierarchy || {},
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

  const pdfUrl = extractPdfUrl(n8nResponse);
  if (n8nOk && pdfUrl) {
    await sb
      .from("church_remanejamentos")
      .update({
        status: "FINALIZADO",
        pdf_storage_path: pdfUrl,
        updated_by_user_id: auth.session.user_id,
      })
      .eq("id", remData.id);
  } else if (!n8nOk) {
    await sb
      .from("church_remanejamentos")
      .update({
        status: "FINALIZADO",
        updated_by_user_id: auth.session.user_id,
      })
      .eq("id", remData.id);
  }

  return json({
    ok: true,
    n8n: { ok: n8nOk, status: n8nStatus, response: n8nResponse },
    remanejamento: {
      id: remData.id,
      status: n8nOk && pdfUrl ? "FINALIZADO" : n8nOk ? "GERANDO" : "FINALIZADO",
      pdf_storage_path: pdfUrl || null,
    },
  }, 200);
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

  if (error) return json({ ok: false, error: "upsert_failed", details: "erro interno" }, 500);
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

  if (error) return json({ ok: false, error: "upsert_failed", details: "erro interno" }, 500);
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
  if (contratoErr) return json({ ok: false, error: "db_error_contrato", details: "erro interno" }, 500);
  if (laudoErr) return json({ ok: false, error: "db_error_laudo", details: "erro interno" }, 500);
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
    if (action === "delete-remanejamento") return await actionDeleteRemanejamento(sb, req, churchTotvsId);
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
        "delete-remanejamento",
        "generate-remanejamento-pdf",
        "get-contrato-form",
        "upsert-contrato",
        "upsert-laudo",
        "generate-contrato-pdf",
      ],
    }, 400);
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
