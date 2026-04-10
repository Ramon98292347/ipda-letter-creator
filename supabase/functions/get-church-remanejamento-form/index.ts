/**
 * get-church-remanejamento-form
 * ==============================
 * O que faz: Retorna os dados do formulário de remanejamento de uma igreja, incluindo o draft
 *            com dados salvos, as informações de hierarquia (se precisa de assinatura setorial
 *            ou estadual) e os dados do pastor signatário.
 * Para que serve: Usada pelo front-end para pré-preencher o formulário de edição do remanejamento
 *                 antes de enviar para o n8n gerar o PDF.
 * Quem pode usar: admin, pastor (somente igrejas dentro do próprio escopo)
 * Recebe: { church_totvs_id: string }
 * Retorna: { ok, draft, hierarchy, status, pdf_storage_path }
 * Observações: O campo hierarchy indica se a assinatura é do pastor setorial ou estadual,
 *              conforme a posição da igreja na hierarquia.
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

type ChurchRow = {
  totvs_id: string;
  parent_totvs_id: string | null;
  class: string | null;
  pastor_user_id: string | null;
  church_name: string | null;
};

function computeScope(rootTotvs: string, churches: ChurchRow[]) {
  const children = new Map<string, string[]>();
  for (const c of churches) {
    const p = String(c.parent_totvs_id || "");
    if (!children.has(p)) children.set(p, []);
    children.get(p)?.push(String(c.totvs_id));
  }
  const scope = new Set<string>();
  const queue = [rootTotvs];
  while (queue.length) {
    const cur = queue.shift() || "";
    if (!cur || scope.has(cur)) continue;
    scope.add(cur);
    for (const k of children.get(cur) || []) queue.push(k);
  }
  return scope;
}

function buildAncestors(targetTotvs: string, byId: Map<string, ChurchRow>) {
  const chain: ChurchRow[] = [];
  let current = byId.get(targetTotvs) || null;
  const guard = new Set<string>();
  while (current) {
    const curId = String(current.totvs_id);
    if (guard.has(curId)) break;
    guard.add(curId);
    chain.push(current);
    const parent = String(current.parent_totvs_id || "");
    if (!parent) break;
    current = byId.get(parent) || null;
  }
  return chain;
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

    const { data: churches, error: churchErr } = await sb
      .from("churches")
      .select("totvs_id,parent_totvs_id,class,pastor_user_id,church_name");
    if (churchErr) return json({ ok: false, error: "db_error_churches", details: "erro interno" }, 500);

    const allChurches = (churches || []) as ChurchRow[];
    const byId = new Map<string, ChurchRow>(allChurches.map((c) => [String(c.totvs_id), c]));
    if (!byId.has(churchTotvsId)) return json({ ok: false, error: "church_not_found" }, 404);

    if (session.role === "pastor") {
      const scope = computeScope(session.active_totvs_id, allChurches);
      if (!scope.has(churchTotvsId)) return json({ ok: false, error: "forbidden_wrong_scope" }, 403);
    }

    const chain = buildAncestors(churchTotvsId, byId);
    const setorial = chain.find((c) => String(c.class || "").toLowerCase() === "setorial");
    const estadual = [...chain].reverse().find((c) => String(c.class || "").toLowerCase() === "estadual");
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

    const targetChurch = byId.get(churchTotvsId);
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
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
