/**
 * docs-api
 * =========
 * API consolidada de documentos de membros e documentos de igrejas.
 * Roteia as chamadas pelo campo "action" no body da requisicao.
 *
 * Actions disponíveis:
 *   "generate-member-docs"     -> gera ficha/carteirinha de membro via n8n (com JWT)
 *   "get-member-docs-status"   -> retorna status de ficha/carteirinha (com JWT)
 *   "member-docs-finish"       -> callback do n8n quando documento esta pronto (sem JWT, chave estatica)
 *   "get-contrato-form"        -> retorna dados do formulario de contrato da igreja (com JWT)
 *   "upsert-contrato"          -> salva dados do contrato da igreja (com JWT)
 *   "generate-contrato-pdf"    -> dispara webhook n8n para gerar PDF do contrato (com JWT)
 *   "get-remanejamento-form"   -> retorna dados do formulario de remanejamento (com JWT)
 *   "upsert-remanejamento"     -> salva dados do remanejamento da igreja (com JWT)
 *   "generate-remanejamento-pdf" -> dispara webhook n8n para gerar PDF do remanejamento (com JWT)
 *
 * Quem pode usar: autenticado (exceto member-docs-finish que usa chave estatica)
 * Recebe: { action: string, ...campos da action especifica }
 * Retorna: conforme cada action (ver handlers abaixo)
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

// --- Utilitarios compartilhados ---

/** Retorna os headers CORS padrao para todas as respostas. */
function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info, x-docs-key",
  };
}

/** Cria uma Response JSON com o status informado. */
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders() });
}

/** Tipos de role aceitos no sistema. */
type Role = "admin" | "pastor" | "obreiro" | "secretario" | "financeiro";

/** Claims presentes no JWT de sessao do usuario. */
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };

/**
 * Verifica o JWT de sessao customizado (USER_SESSION_JWT_SECRET).
 * Retorna os claims se valido, ou null se invalido/ausente.
 */
async function verifySessionJWT(req: Request): Promise<SessionClaims | null> {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearers+(.+)$/i);
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
// =============================================================================
// HELPERS: generate-member-docs e member-docs-finish
// Funcoes auxiliares para geracao e atualizacao de documentos de membros.
// =============================================================================
function tableByType(documentType: "ficha_membro" | "carteirinha") {
  return documentType === "ficha_membro" ? "member_ficha_documents" : "member_carteirinha_documents";
}

function toText(value: unknown) {
  return String(value || "").trim();
}

async function upsertDocStatus(
  sb: ReturnType<typeof createClient>,
  documentType: "ficha_membro" | "carteirinha",
  memberId: string,
  churchTotvsId: string,
  requestedByUserId: string,
  requestPayload: Record<string, unknown>,
  fichaUrlQr: string | null,
) {
  const payload: Record<string, unknown> = {
    member_id: memberId,
    church_totvs_id: churchTotvsId,
    status: "ENVIADO_CONFECCAO",
    request_payload: requestPayload,
    requested_by_user_id: requestedByUserId,
    requested_at: new Date().toISOString(),
    final_url: null,
    error_message: null,
    webhook_response: {},
    updated_at: new Date().toISOString(),
  };

  if (documentType === "carteirinha") {
    payload.ficha_url_qr = fichaUrlQr;
  }

  const table = tableByType(documentType);
  const { error } = await sb.from(table).upsert(payload, {
    onConflict: "member_id,church_totvs_id",
  });
  return error;
}

async function updateWebhookStatus(
  sb: ReturnType<typeof createClient>,
  documentType: "ficha_membro" | "carteirinha",
  memberId: string,
  churchTotvsId: string,
  webhookData: unknown,
  webhookOk: boolean,
) {
  const table = tableByType(documentType);
  await sb
    .from(table)
    .update({
      webhook_response: webhookData as Record<string, unknown>,
      status: webhookOk ? "ENVIADO_CONFECCAO" : "ERRO",
      error_message: webhookOk ? null : "webhook_failed",
      updated_at: new Date().toISOString(),
    })
    .eq("member_id", memberId)
    .eq("church_totvs_id", churchTotvsId);
}

// =============================================================================
// HANDLER: generate-member-docs
// Logica original de: supabase/functions/generate-member-docs/index.ts
// Dispara o webhook n8n para gerar ficha/carteirinha de membro.
// Requer JWT.
// =============================================================================
async function handleGenerateMemberDocs(req: Request, body: Record<string, unknown>) {
  const session = await verifySessionJWT(req);
      if (!session) return json({ ok: false, error: "unauthorized" }, 401);
  
      const documentType = String(body.document_type || "").trim() as DocumentType;
      const memberId = String(body.member_id || "").trim();
      const churchTotvsId = String(body.church_totvs_id || session.active_totvs_id || "").trim();
      const dados = body.dados || {};
  
      if (!["ficha_membro", "carteirinha", "ficha_obreiro", "ficha_carteirinha"].includes(documentType)) {
        return json({ ok: false, error: "invalid_document_type" }, 400);
      }
      if (!memberId) return json({ ok: false, error: "missing_member_id" }, 400);
      if (!churchTotvsId) return json({ ok: false, error: "missing_church_totvs_id" }, 400);
  
      const sb = createClient(
        Deno.env.get("SUPABASE_URL") || "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      );
  
      const { data: member, error: memberErr } = await sb
        .from("users")
        .select("id, default_totvs_id, full_name, role, phone, email, cep, address_street, address_number, address_neighborhood, address_city, address_state")
        .eq("id", memberId)
        .maybeSingle();
  
      if (memberErr) return json({ ok: false, error: "db_error_member", details: "erro interno" }, 500);
      if (!member) return json({ ok: false, error: "member_not_found" }, 404);
      if (String(member.default_totvs_id || "") !== churchTotvsId) {
        return json({ ok: false, error: "forbidden_wrong_church" }, 403);
      }
      if (session.role === "obreiro" && memberId !== session.user_id) {
        return json({ ok: false, error: "forbidden_only_own_member" }, 403);
      }
  
      const { data: church, error: churchErr } = await sb
        .from("churches")
        .select("church_name, pastor_user_id, stamp_church_url, address_street, address_number, address_neighborhood, address_city, address_state, cep")
        .eq("totvs_id", churchTotvsId)
        .maybeSingle();
      if (churchErr) return json({ ok: false, error: "db_error_church", details: "erro interno" }, 500);
  
      let pastorSignatureUrl = "";
      if (church?.pastor_user_id) {
        const { data: pastor, error: pastorErr } = await sb
          .from("users")
          .select("signature_url, full_name, phone, email")
          .eq("id", String(church.pastor_user_id))
          .maybeSingle();
        if (pastorErr) return json({ ok: false, error: "db_error_pastor_signature", details: "erro interno" }, 500);
        pastorSignatureUrl = String(pastor?.signature_url || "");
        // Comentario: sempre força assinatura e dados do pastor da igreja do membro.
        // Isso evita reaproveitar URL antiga enviada pelo front de outro pastor/igreja.
        dados.assinatura_pastor_url = pastorSignatureUrl;
        dados.pastor_responsavel_nome = String(pastor?.full_name || "");
        dados.pastor_responsavel_telefone = String(pastor?.phone || "");
        dados.pastor_responsavel_email = String(pastor?.email || "");
      }
  
      let fichaFinalUrl = "";
      const { data: fichaSaved, error: fichaSavedErr } = await sb
        .from("member_ficha_documents")
        .select("final_url")
        .eq("member_id", memberId)
        .eq("church_totvs_id", churchTotvsId)
        .maybeSingle();
      if (fichaSavedErr) return json({ ok: false, error: "db_error_ficha_saved", details: "erro interno" }, 500);
      fichaFinalUrl = String(fichaSaved?.final_url || "");
  
      const createBundle = documentType === "ficha_carteirinha";
  
      if (documentType === "carteirinha" && !createBundle && !fichaFinalUrl) {
        return json(
          {
            ok: false,
            error: "ficha_required_before_carteirinha",
            detail: "A carteirinha so pode ser gerada depois que a ficha estiver pronta.",
          },
          409,
        );
      }
  
      const churchAddressParts = [
        String(church?.address_street || "").trim(),
        church?.address_number ? `numero ${String(church.address_number).trim()}` : "",
        String(church?.address_neighborhood || "").trim(),
        String(church?.address_city || "").trim(),
      ].filter(Boolean);
      const churchUf = String(church?.address_state || "").trim().toUpperCase();
      const churchCepDigits = String(church?.cep || "").replace(/\D/g, "").slice(0, 8);
      const churchCepFormatted = churchCepDigits.length === 8
        ? `${churchCepDigits.slice(0, 5)}-${churchCepDigits.slice(5)}`
        : "";
      const churchAddressBase = churchAddressParts.join(", ");
      const churchAddressWithUf = churchUf ? `${churchAddressBase} - ${churchUf}` : churchAddressBase;
      const churchAddressFull = churchCepFormatted ? `${churchAddressWithUf} - CEP ${churchCepFormatted}` : churchAddressWithUf;
  
      const cepFromDados = String(
        dados.cep_membro || dados.cep_usuario || dados.cep || dados.zip || dados.cep_congregacao || "",
      ).replace(/\D/g, "");
      const memberCepDigits = String(cepFromDados || member?.cep || "").replace(/\D/g, "").slice(0, 8);
      const memberCepFormatted = memberCepDigits.length === 8
        ? `${memberCepDigits.slice(0, 5)}-${memberCepDigits.slice(5)}`
        : "";
  
      const requestPayload: Record<string, unknown> = {
        nome_completo: toText(dados.nome_completo) || String(member.full_name || ""),
        matricula: toText(dados.matricula),
        funcao_ministerial: toText(dados.funcao_ministerial),
        data_nascimento: toText(dados.data_nascimento),
        dados: {
          member_cep: toText(dados.member_cep) || memberCepFormatted,
          endereco_igreja_completo: toText(dados.endereco_igreja_completo) || churchAddressFull,
          igreja_nome: toText(dados.igreja_nome) || toText(church?.church_name),
          telefone: toText(dados.telefone) || String(member.phone || ""),
        },
        endereco: toText(dados.endereco) || String(member.address_street || ""),
        numero: toText(dados.numero) || String(member.address_number || ""),
        bairro: toText(dados.bairro) || String(member.address_neighborhood || ""),
        cidade: toText(dados.cidade) || String(member.address_city || ""),
        estado: toText(dados.estado) || String(member.address_state || ""),
        estado_civil: toText(dados.estado_civil),
        data_batismo: toText(dados.data_batismo),
        cpf: toText(dados.cpf),
        foto_3x4_url: toText(dados.foto_3x4_url),
        rg: toText(dados.rg),
        email: toText(dados.email) || String(member.email || ""),
        cidade_nascimento: toText(dados.cidade_nascimento),
        uf_nascimento: toText(dados.uf_nascimento),
        profissao: toText(dados.profissao) || toText(dados.profession),
        carimbo_igreja_url: toText(dados.carimbo_igreja_url) || String(church?.stamp_church_url || ""),
        assinatura_pastor_url: toText(dados.assinatura_pastor_url) || pastorSignatureUrl,
        member_id: memberId,
      };
  
      const qrCodeUrl = toText(dados.qr_code_url) || fichaFinalUrl;
      if (qrCodeUrl) requestPayload.qr_code_url = qrCodeUrl;
  
      const docsToUpdate: Array<"ficha_membro" | "carteirinha"> = createBundle
        ? ["ficha_membro", "carteirinha"]
        : documentType === "ficha_membro" || documentType === "carteirinha"
          ? [documentType]
          : [];
  
      for (const docType of docsToUpdate) {
        const err = await upsertDocStatus(
          sb,
          docType,
          memberId,
          churchTotvsId,
          session.user_id,
          requestPayload,
          fichaFinalUrl || null,
        );
        if (err) return json({ ok: false, error: "db_error_upsert_status", details: "erro interno" }, 500);
      }
  
      const webhook =
        Deno.env.get("N8N_MEMBER_DOCS_WEBHOOK_URL") ||
        "https://n8n-n8n.ynlng8.easypanel.host/webhook/ficha-carteirinha";
  
      const webhookPayload = {
        ...requestPayload,
      };
  
      const resp = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(webhookPayload),
      });
  
      const text = await resp.text();
      let webhookData: unknown = { raw: text };
      try {
        webhookData = JSON.parse(text);
      } catch {
        // resposta textual
      }
  
      for (const docType of docsToUpdate) {
        await updateWebhookStatus(sb, docType, memberId, churchTotvsId, webhookData, resp.ok);
      }
  
      if (!resp.ok) {
        return json(
          { ok: false, error: "webhook_failed", status: resp.status, details: webhookData },
          502,
        );
      }
  
      return json(
        {
          ok: true,
          message: "Documento enviado para confeccao.",
          response: webhookData,
        },
        200,
      );
}

// =============================================================================
// HANDLER: get-member-docs-status
// Logica original de: supabase/functions/get-member-docs-status/index.ts
// Retorna o status da ficha e carteirinha de um membro.
// Requer JWT.
// =============================================================================
async function handleGetMemberDocsStatus(req: Request, body: Record<string, unknown>) {
  const session = await verifySessionJWT(req);
      if (!session) return json({ ok: false, error: "unauthorized" }, 401);
  
      const memberId = String(body.member_id || session.user_id || "").trim();
      const churchTotvsId = String(body.church_totvs_id || session.active_totvs_id || "").trim();
  
      if (!memberId) return json({ ok: false, error: "missing_member_id" }, 400);
      if (!churchTotvsId) return json({ ok: false, error: "missing_church_totvs_id" }, 400);
  
      if (session.role === "obreiro" && memberId !== session.user_id) {
        return json({ ok: false, error: "forbidden_only_own_member" }, 403);
      }
  
      const sb = createClient(
        Deno.env.get("SUPABASE_URL") || "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      );
  
      const [{ data: ficha, error: fichaErr }, { data: carteirinha, error: cardErr }] = await Promise.all([
        sb
          .from("member_ficha_documents")
          .select("id, member_id, church_totvs_id, status, final_url, error_message, requested_at, finished_at, updated_at")
          .eq("member_id", memberId)
          .eq("church_totvs_id", churchTotvsId)
          .maybeSingle(),
        sb
          .from("member_carteirinha_documents")
          .select("id, member_id, church_totvs_id, status, final_url, ficha_url_qr, error_message, requested_at, finished_at, updated_at")
          .eq("member_id", memberId)
          .eq("church_totvs_id", churchTotvsId)
          .maybeSingle(),
      ]);
  
      if (fichaErr) return json({ ok: false, error: "db_error_ficha", details: "erro interno" }, 500);
      if (cardErr) return json({ ok: false, error: "db_error_carteirinha", details: "erro interno" }, 500);
  
      const fichaReady = String(ficha?.final_url || "").trim().length > 0;
      const cardReady = String(carteirinha?.final_url || "").trim().length > 0;
  
      return json(
        {
          ok: true,
          member_id: memberId,
          church_totvs_id: churchTotvsId,
          ficha: ficha || null,
          carteirinha: carteirinha || null,
          rules: {
            ficha_pronta: fichaReady,
            carteirinha_pronta: cardReady,
            can_generate_carteirinha: fichaReady,
          },
        },
        200,
      );
}

// =============================================================================
// HANDLER: member-docs-finish
// Logica original de: supabase/functions/member-docs-finish/index.ts
// Callback chamado pelo n8n apos concluir a geracao de ficha ou carteirinha.
// Sem JWT -- autenticado pela chave estatica x-docs-key (MEMBER_DOCS_FINISH_KEY).
// =============================================================================
// Funcao auxiliar para member-docs-finish: mapeia tipo de documento para tabela
function tableByDocumentType(documentType: string) {
  return documentType === "ficha_membro" ? "member_ficha_documents" : "member_carteirinha_documents";
}

async function handleMemberDocsFinish(req: Request, body: Record<string, unknown>) {
  const secretHeader = req.headers.get("x-docs-key") || "";
      const secretExpected = Deno.env.get("MEMBER_DOCS_FINISH_KEY") || "";
      if (!secretExpected || secretHeader !== secretExpected) {
        return json({ ok: false, error: "unauthorized_finish_key" }, 401);
      }
  
      const documentType = String(body.document_type || "").trim() as DocumentType;
      const memberId = String(body.member_id || "").trim();
      const churchTotvsId = String(body.church_totvs_id || "").trim();
      const status = String(body.status || "").trim().toUpperCase();
      const finalUrl = String(body.final_url || "").trim() || null;
      const errorMessage = String(body.error_message || "").trim() || null;
      const details = body.details || {};
  
      if (!["ficha_membro", "carteirinha"].includes(documentType)) {
        return json({ ok: false, error: "invalid_document_type" }, 400);
      }
      if (!memberId) return json({ ok: false, error: "missing_member_id" }, 400);
      if (!churchTotvsId) return json({ ok: false, error: "missing_church_totvs_id" }, 400);
      if (!["PRONTO", "ERRO", "ENVIADO_CONFECCAO"].includes(status)) {
        return json({ ok: false, error: "invalid_status" }, 400);
      }
      if (status === "PRONTO" && !finalUrl) {
        return json({ ok: false, error: "missing_final_url" }, 400);
      }
  
      const sb = createClient(
        Deno.env.get("SUPABASE_URL") || "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      );
  
      const updateData: Record<string, unknown> = {
        status,
        final_url: finalUrl,
        error_message: status === "ERRO" ? errorMessage || "erro_na_geracao" : null,
        webhook_response: details,
        finished_at: status === "PRONTO" || status === "ERRO" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };
  
      const table = tableByDocumentType(documentType);
      const { data, error } = await sb
        .from(table)
        .update(updateData)
        .eq("member_id", memberId)
        .eq("church_totvs_id", churchTotvsId)
        .select("id, member_id, church_totvs_id, status, final_url, updated_at")
        .maybeSingle();
  
      if (error) return json({ ok: false, error: "db_error_update_status", details: "erro interno" }, 500);
      if (!data) return json({ ok: false, error: "document_request_not_found" }, 404);
  
      return json({ ok: true, document: data }, 200);
}

// =============================================================================
// HANDLER: get-contrato-form
// Logica original de: supabase/functions/get-church-contrato-form/index.ts
// Retorna os dados do formulario de contrato de uma igreja.
// Requer JWT (admin ou pastor).
// =============================================================================
async function handleGetContratoForm(req: Request, body: Record<string, unknown>) {
  const session = await verifySessionJWT(req);
      if (!session) return json({ ok: false, error: "unauthorized" }, 401);
      if (session.role === "obreiro") return json({ ok: false, error: "forbidden" }, 403);
  
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
}

// =============================================================================
// HANDLER: upsert-contrato
// Logica original de: supabase/functions/upsert-church-contrato/index.ts
// Salva (cria ou atualiza) os dados do contrato de uma igreja.
// Requer JWT (admin ou pastor).
// =============================================================================
async function handleUpsertContrato(req: Request, body: Record<string, unknown>) {
  const session = await verifySessionJWT(req);
      if (!session) return json({ ok: false, error: "unauthorized" }, 401);
      if (session.role === "obreiro") return json({ ok: false, error: "forbidden" }, 403);
  
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
}

// =============================================================================
// HANDLER: generate-contrato-pdf
// Logica original de: supabase/functions/generate-church-contrato-pdf/index.ts
// Dispara o webhook n8n para gerar o PDF do contrato da igreja.
// Requer JWT (admin ou pastor).
// =============================================================================
async function handleGenerateContratoPdf(req: Request, body: Record<string, unknown>) {
  const session = await verifySessionJWT(req);
      if (!session) return json({ ok: false, error: "unauthorized" }, 401);
      if (session.role === "obreiro") return json({ ok: false, error: "forbidden" }, 403);
  
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
}
