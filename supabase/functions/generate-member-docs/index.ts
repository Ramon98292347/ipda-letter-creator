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
type DocumentType = "ficha_membro" | "carteirinha" | "ficha_obreiro";
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

function tableByDocumentType(documentType: DocumentType) {
  if (documentType === "ficha_membro") return "member_ficha_documents";
  if (documentType === "carteirinha") return "member_carteirinha_documents";
  return "member_ficha_documents";
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

    if (!["ficha_membro", "carteirinha", "ficha_obreiro"].includes(documentType)) {
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
      .select("id, default_totvs_id, full_name, role")
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

    let fichaRow: { final_url?: string | null; status?: string | null } | null = null;
    if (documentType === "carteirinha") {
      const { data: ficha, error: fichaErr } = await sb
        .from("member_ficha_documents")
        .select("final_url, status")
        .eq("member_id", memberId)
        .eq("church_totvs_id", churchTotvsId)
        .maybeSingle();
      if (fichaErr) return json({ ok: false, error: "db_error_ficha_status", details: fichaErr.message }, 500);

      fichaRow = ficha;
      const fichaReady = String(ficha?.final_url || "").trim().length > 0;
      if (!fichaReady) {
        return json(
          {
            ok: false,
            error: "ficha_required_before_carteirinha",
            detail: "A carteirinha so pode ser gerada depois que a ficha estiver pronta.",
          },
          409,
        );
      }
    }

    const webhook =
      Deno.env.get("N8N_MEMBER_DOCS_WEBHOOK_URL") ||
      "https://n8n-n8n.ynlng8.easypanel.host/webhook/ficha-carteirinha";

    const requestPayload: Record<string, unknown> = {
      ...dados,
      member_id: memberId,
      church_totvs_id: churchTotvsId,
      member_name: member.full_name,
      requested_by_user_id: session.user_id,
      requested_by_role: session.role,
      document_type: documentType,
    };
    if (documentType === "carteirinha") {
      requestPayload.qr_code_url = String(fichaRow?.final_url || "");
    }

    if (documentType === "ficha_membro" || documentType === "carteirinha") {
      const upsertBase: Record<string, unknown> = {
        member_id: memberId,
        church_totvs_id: churchTotvsId,
        status: "ENVIADO_CONFECCAO",
        request_payload: requestPayload,
        requested_by_user_id: session.user_id,
        requested_at: new Date().toISOString(),
        final_url: null,
        error_message: null,
        webhook_response: {},
        updated_at: new Date().toISOString(),
      };

      if (documentType === "carteirinha") {
        upsertBase.ficha_url_qr = String(fichaRow?.final_url || "");
      }

      const table = tableByDocumentType(documentType);
      const { error: upErr } = await sb.from(table).upsert(upsertBase, {
        onConflict: "member_id,church_totvs_id",
      });

      if (upErr) return json({ ok: false, error: "db_error_upsert_status", details: upErr.message }, 500);
    }

    const webhookPayload = {
      action: "generate_member_docs",
      document_type: documentType,
      member_id: memberId,
      member_name: member.full_name,
      church_totvs_id: churchTotvsId,
      requested_by_user_id: session.user_id,
      requested_by_role: session.role,
      dados: requestPayload,
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

    if (documentType === "ficha_membro" || documentType === "carteirinha") {
      const table = tableByDocumentType(documentType);
      await sb
        .from(table)
        .update({
          webhook_response: webhookData as Record<string, unknown>,
          status: resp.ok ? "ENVIADO_CONFECCAO" : "ERRO",
          error_message: resp.ok ? null : "webhook_failed",
          updated_at: new Date().toISOString(),
        })
        .eq("member_id", memberId)
        .eq("church_totvs_id", churchTotvsId);
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
