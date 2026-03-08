import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

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

type Role = "admin" | "pastor" | "obreiro";
type SingleDocumentType = "ficha_membro" | "carteirinha" | "ficha_obreiro";
type DocumentType = SingleDocumentType | "ficha_carteirinha";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };
type Body = {
  document_type?: DocumentType;
  member_id?: string;
  church_totvs_id?: string;
  dados?: Record<string, unknown>;
};

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
    if (!["admin", "pastor", "obreiro"].includes(role)) return null;
    return { user_id, role, active_totvs_id };
  } catch {
    return null;
  }
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;
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

    if (memberErr) return json({ ok: false, error: "db_error_member", details: memberErr.message }, 500);
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
    if (churchErr) return json({ ok: false, error: "db_error_church", details: churchErr.message }, 500);

    let pastorSignatureUrl = "";
    if (church?.pastor_user_id) {
      const { data: pastor, error: pastorErr } = await sb
        .from("users")
        .select("signature_url, full_name, phone, email")
        .eq("id", String(church.pastor_user_id))
        .maybeSingle();
      if (pastorErr) return json({ ok: false, error: "db_error_pastor_signature", details: pastorErr.message }, 500);
      pastorSignatureUrl = String(pastor?.signature_url || "");
      if (!dados.assinatura_pastor_url) dados.assinatura_pastor_url = pastorSignatureUrl;
      if (!dados.pastor_responsavel_nome) dados.pastor_responsavel_nome = String(pastor?.full_name || "");
      if (!dados.pastor_responsavel_telefone) dados.pastor_responsavel_telefone = String(pastor?.phone || "");
      if (!dados.pastor_responsavel_email) dados.pastor_responsavel_email = String(pastor?.email || "");
    }

    let fichaFinalUrl = "";
    const { data: fichaSaved, error: fichaSavedErr } = await sb
      .from("member_ficha_documents")
      .select("final_url")
      .eq("member_id", memberId)
      .eq("church_totvs_id", churchTotvsId)
      .maybeSingle();
    if (fichaSavedErr) return json({ ok: false, error: "db_error_ficha_saved", details: fichaSavedErr.message }, 500);
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
      if (err) return json({ ok: false, error: "db_error_upsert_status", details: err.message }, 500);
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
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
