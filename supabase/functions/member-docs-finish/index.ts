import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info, x-docs-key",
  };
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders() });
}

type DocumentType = "ficha_membro" | "carteirinha";
type Body = {
  document_type?: DocumentType;
  member_id?: string;
  church_totvs_id?: string;
  status?: "PRONTO" | "ERRO" | "ENVIADO_CONFECCAO";
  final_url?: string | null;
  error_message?: string | null;
  details?: Record<string, unknown>;
};

function tableByDocumentType(documentType: DocumentType) {
  return documentType === "ficha_membro" ? "member_ficha_documents" : "member_carteirinha_documents";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const secretHeader = req.headers.get("x-docs-key") || "";
    const secretExpected = Deno.env.get("MEMBER_DOCS_FINISH_KEY") || "";
    if (!secretExpected || secretHeader !== secretExpected) {
      return json({ ok: false, error: "unauthorized_finish_key" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as Body;
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

    if (error) return json({ ok: false, error: "db_error_update_status", details: error.message }, 500);
    if (!data) return json({ ok: false, error: "document_request_not_found" }, 404);

    return json({ ok: true, document: data }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
