/**
 * member-docs-api
 * ===============
 * O que faz: Agrupa as funcoes de documentos de membro em uma unica entrada por "action".
 * Para que serve: Simplifica a manutencao do fluxo de ficha/carteirinha sem quebrar
 *                 os webhooks e functions legadas ja existentes.
 * Quem pode usar: admin, pastor, obreiro e n8n conforme a action encaminhada.
 * Recebe:
 *   action: "generate" -> generate-member-docs
 *   action: "status" -> get-member-docs-status
 *   action: "finish" -> member-docs-finish
 * Retorna: o mesmo payload da function legada correspondente.
 * Observacoes: verify_jwt deve ficar false no config.toml; a validacao de JWT
 *              ou x-docs-key continua sendo feita nas functions legadas.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info, x-docs-key",
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}

const ACTION_TO_SLUG: Record<string, string> = {
  "generate": "generate-member-docs",
  "status": "get-member-docs-status",
  "finish": "member-docs-finish",
};

function buildForwardHeaders(req: Request) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const auth = req.headers.get("authorization");
  const apikey = req.headers.get("apikey");
  const clientInfo = req.headers.get("x-client-info");
  const docsKey = req.headers.get("x-docs-key");
  if (auth) headers.authorization = auth;
  if (apikey) headers.apikey = apikey;
  if (clientInfo) headers["x-client-info"] = clientInfo;
  if (docsKey) headers["x-docs-key"] = docsKey;
  return headers;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "").trim().toLowerCase();
    const slug = ACTION_TO_SLUG[action];
    if (!slug) {
      return json(
        {
          ok: false,
          error: "invalid_action",
          message: 'Use uma action valida: "generate", "status", "finish".',
        },
        400,
      );
    }

    const forwardBody = { ...body };
    delete forwardBody.action;

    const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
    if (!supabaseUrl) return json({ ok: false, error: "missing_supabase_url" }, 500);

    const resp = await fetch(`${supabaseUrl}/functions/v1/${slug}`, {
      method: "POST",
      headers: buildForwardHeaders(req),
      body: JSON.stringify(forwardBody),
    });

    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: corsHeaders(),
    });
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
