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
 *   action: "list-ready" -> lista carteirinhas prontas para impressao em lote
 *   action: "mark-printed" -> marca carteirinhas como impressas (atualiza printed_at)
 *   action: "generate-print-batch" -> envia lote para n8n e cria registro de documento unico
 *   action: "list-print-batches" -> lista documentos unicos gerados na aba impressao
 * Retorna: o mesmo payload da function legada correspondente.
 * Observacoes: verify_jwt deve ficar false no config.toml; a validacao de JWT
 *              ou x-docs-key continua sendo feita nas functions legadas.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

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
const PRINT_BATCH_WEBHOOK_URL =
  String(Deno.env.get("MEMBER_DOCS_PRINT_BATCH_WEBHOOK_URL") || "").trim() ||
  "https://n8n-n8n.ynlng8.easypanel.host/webhook/ficha-carteirinha";

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

// Comentario: cria cliente Supabase admin para actions que consultam o banco direto
function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return createClient(url, key);
}

// Comentario: valida o JWT custom da aplicacao (USER_SESSION_JWT_SECRET).
async function getUserFromJwt(req: Request): Promise<{ id: string; role: string; active_totvs_id: string } | null> {
  try {
    const auth = req.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return null;
    const token = auth.slice(7).trim();
    const secret = Deno.env.get("USER_SESSION_JWT_SECRET") || "";
    if (!secret) return null;

    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });

    const userId = String(payload.sub || "").trim();
    const rawRole = String(payload.role || "").toLowerCase().trim();
    const appRole = String(payload.app_role || "").toLowerCase().trim();
    const role = rawRole === "authenticated" ? appRole : rawRole;
    const active_totvs_id = String(payload.active_totvs_id || "").trim();
    if (!userId || !role || !active_totvs_id) return null;

    return { id: userId, role, active_totvs_id };
  } catch {
    return null;
  }
}

/**
 * list-ready: Lista carteirinhas com status PRONTO para uma church_totvs_id.
 * Retorna dados do membro junto para montar a tabela de impressao.
 */
async function handleListReady(body: Record<string, unknown>, req: Request) {
  const user = await getUserFromJwt(req);
  if (!user) return json({ ok: false, error: "unauthorized" }, 401);
  if (!["admin", "pastor", "secretario"].includes(user.role)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const churchTotvsId = String(body.church_totvs_id || "").trim();
  if (!churchTotvsId) return json({ ok: false, error: "church_totvs_id_required" }, 400);

  const sb = getAdminClient();
  // Comentario: busca todas as carteirinhas PRONTO da igreja, com dados do membro via join
  const { data, error } = await sb
    .from("member_carteirinha_documents")
    .select(`
      id,
      member_id,
      status,
      final_url,
      ficha_url_qr,
      printed_at,
      request_payload,
      finished_at,
      users!member_carteirinha_documents_member_fk (
        full_name,
        cpf,
        minister_role,
        avatar_url,
        default_totvs_id
      )
    `)
    .eq("church_totvs_id", churchTotvsId)
    .eq("status", "PRONTO")
    .order("finished_at", { ascending: false });

  if (error) return json({ ok: false, error: error.message }, 500);

  // Comentario: formata resposta com dados do membro achatados
  const items = (data || []).map((row: Record<string, unknown>) => {
    const member = (row.users || {}) as Record<string, unknown>;
    return {
      id: row.id,
      member_id: row.member_id,
      final_url: row.final_url,
      ficha_url_qr: row.ficha_url_qr,
      printed_at: row.printed_at,
      finished_at: row.finished_at,
      request_payload: row.request_payload,
      member_name: member.full_name || "",
      member_cpf: member.cpf || "",
      member_minister_role: member.minister_role || "",
      member_avatar_url: member.avatar_url || "",
    };
  });

  return json({ ok: true, items });
}

/**
 * mark-printed: Atualiza printed_at para as carteirinhas selecionadas.
 * Recebe ids: string[] com os IDs das carteirinhas.
 */
async function handleMarkPrinted(body: Record<string, unknown>, req: Request) {
  const user = await getUserFromJwt(req);
  if (!user) return json({ ok: false, error: "unauthorized" }, 401);
  if (!["admin", "pastor", "secretario"].includes(user.role)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const ids = body.ids as string[] | undefined;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return json({ ok: false, error: "ids_required" }, 400);
  }

  const sb = getAdminClient();
  const { error } = await sb
    .from("member_carteirinha_documents")
    .update({ printed_at: new Date().toISOString() })
    .in("id", ids);

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, updated: ids.length });
}

function pickUrlFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const candidates = [
    obj.url,
    obj.final_url,
    obj.file_url,
    obj.document_url,
    obj.pdf_url,
    obj.download_url,
    obj.link,
  ];
  for (const c of candidates) {
    const url = String(c || "").trim();
    if (/^https?:\/\//i.test(url)) return url;
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const nested = pickUrlFromPayload(item);
      if (nested) return nested;
    }
  }
  return null;
}

async function handleGeneratePrintBatch(body: Record<string, unknown>, req: Request) {
  const user = await getUserFromJwt(req);
  if (!user) return json({ ok: false, error: "unauthorized" }, 401);
  if (!["admin", "pastor", "secretario"].includes(user.role)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map((v) => String(v || "").trim()).filter(Boolean) : [];
  const churchTotvsId = String(body.church_totvs_id || "").trim();
  if (!churchTotvsId) return json({ ok: false, error: "church_totvs_id_required" }, 400);
  if (ids.length === 0) return json({ ok: false, error: "ids_required" }, 400);

  const sb = getAdminClient();
  const { data: rows, error } = await sb
    .from("member_carteirinha_documents")
    .select(`
      id,
      member_id,
      church_totvs_id,
      status,
      final_url,
      ficha_url_qr,
      request_payload,
      users!member_carteirinha_documents_member_fk (
        full_name,
        cpf,
        minister_role,
        avatar_url,
        phone,
        email
      )
    `)
    .in("id", ids)
    .eq("church_totvs_id", churchTotvsId)
    .eq("status", "PRONTO");

  if (error) return json({ ok: false, error: error.message }, 500);
  const selected = rows || [];
  if (selected.length === 0) return json({ ok: false, error: "no_ready_documents_found" }, 404);

  const { data: church } = await sb
    .from("churches")
    .select("church_name")
    .eq("totvs_id", churchTotvsId)
    .maybeSingle();

  const carteirinhas = selected.map((row: Record<string, unknown>) => {
    const member = (row.users || {}) as Record<string, unknown>;
    return {
      carteirinha_id: row.id,
      member_id: row.member_id,
      nome: member.full_name || "",
      cpf: member.cpf || "",
      funcao_ministerial: member.minister_role || "",
      foto_url: member.avatar_url || "",
      telefone: member.phone || "",
      email: member.email || "",
      carteirinha_url: row.final_url || "",
      qr_code_url: row.ficha_url_qr || "",
      ...(row.request_payload && typeof row.request_payload === "object" ? (row.request_payload as Record<string, unknown>) : {}),
    };
  });

  const webhookPayload = {
    action: "print_batch_carteirinhas",
    layout: "4_per_a4",
    total: carteirinhas.length,
    igreja_totvs_id: churchTotvsId,
    igreja_nome: String(church?.church_name || ""),
    generated_by_user_id: user.id,
    generated_by_role: user.role,
    carteirinhas,
    source: "ipda-letter-creator",
  };

  const batchInsertPayload = {
    church_totvs_id: churchTotvsId,
    created_by_user_id: user.id,
    status: "PROCESSANDO",
    total_items: carteirinhas.length,
    requested_ids: ids,
  };
  const { data: batch, error: batchInsertError } = await sb
    .from("member_carteirinha_print_batches")
    .insert(batchInsertPayload)
    .select("id")
    .single();
  if (batchInsertError) {
    return json({ ok: false, error: "batch_insert_failed", details: batchInsertError.message }, 500);
  }
  const batchId = String(batch?.id || "");

  let responseData: unknown = null;
  try {
    const resp = await fetch(PRINT_BATCH_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookPayload),
    });
    const text = await resp.text();
    try {
      responseData = JSON.parse(text);
    } catch {
      responseData = { raw: text };
    }

    if (!resp.ok) {
      await sb
        .from("member_carteirinha_print_batches")
        .update({
          status: "ERRO",
          error_message: `Webhook retornou ${resp.status}`,
          webhook_response: responseData as Record<string, unknown>,
          finished_at: new Date().toISOString(),
        })
        .eq("id", batchId);
      return json({ ok: false, error: "webhook_failed", status: resp.status, response: responseData }, 502);
    }
  } catch (err) {
    await sb
      .from("member_carteirinha_print_batches")
      .update({
        status: "ERRO",
        error_message: String(err),
        finished_at: new Date().toISOString(),
      })
      .eq("id", batchId);
    return json({ ok: false, error: "webhook_unreachable", details: String(err) }, 502);
  }

  const documentUrl = pickUrlFromPayload(responseData);
  const nextStatus = documentUrl ? "PRONTO" : "PROCESSANDO";
  await sb
    .from("member_carteirinha_print_batches")
    .update({
      status: nextStatus,
      final_url: documentUrl || null,
      webhook_response: responseData as Record<string, unknown>,
      error_message: null,
      finished_at: documentUrl ? new Date().toISOString() : null,
    })
    .eq("id", batchId);
  return json({
    ok: true,
    batch_id: batchId,
    status: nextStatus,
    total: carteirinhas.length,
    document_url: documentUrl,
    response: responseData,
  });
}

async function handleListPrintBatches(body: Record<string, unknown>, req: Request) {
  const user = await getUserFromJwt(req);
  if (!user) return json({ ok: false, error: "unauthorized" }, 401);
  if (!["admin", "pastor", "secretario"].includes(user.role)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const churchTotvsId = String(body.church_totvs_id || "").trim();
  if (!churchTotvsId) return json({ ok: false, error: "church_totvs_id_required" }, 400);

  const sb = getAdminClient();
  const { data, error } = await sb
    .from("member_carteirinha_print_batches")
    .select("id, status, total_items, final_url, error_message, created_at, updated_at, finished_at, created_by_user_id")
    .eq("church_totvs_id", churchTotvsId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, items: data || [] });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "").trim().toLowerCase();

    // Comentario: actions que rodam direto nesta edge function (sem forward)
    if (action === "list-ready") return await handleListReady(body, req);
    if (action === "mark-printed") return await handleMarkPrinted(body, req);
    if (action === "generate-print-batch") return await handleGeneratePrintBatch(body, req);
    if (action === "list-print-batches") return await handleListPrintBatches(body, req);

    const slug = ACTION_TO_SLUG[action];
    if (!slug) {
      return json(
        {
          ok: false,
          error: "invalid_action",
          message: 'Use uma action valida: "generate", "status", "finish", "list-ready", "mark-printed", "generate-print-batch", "list-print-batches".',
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
