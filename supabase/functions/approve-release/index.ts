/**
 * approve-release
 * ===============
 * O que faz: Aprova uma solicitação de liberação de carta de pregação que estava PENDENTE,
 *            atualiza o status da carta para LIBERADA e dispara o webhook n8n para gerar o PDF.
 * Para que serve: Usada pelo pastor/admin para liberar manualmente uma carta que passou pelo
 *                 fluxo de solicitação de liberação (release_requests).
 * Quem pode usar: admin, pastor (somente cartas da própria igreja ativa)
 * Recebe: { request_id: string }
 * Retorna: { ok, request, letter, n8n: { fired, status, error } }
 * Observações: Após aprovação, dispara webhook n8n (N8N_WEBHOOK_URL) para gerar o PDF da carta.
 *              O erro no webhook não reverte a aprovação. Cria notificação para o solicitante.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

const N8N_WEBHOOK_URL = Deno.env.get("N8N_LETTER_WEBHOOK_URL")
  || Deno.env.get("N8N_WEBHOOK_CARTA_PREGACAO")
  || "";

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

type Role = "admin" | "pastor" | "obreiro";

type SessionClaims = {
  user_id: string;
  role: Role;
  active_totvs_id: string;
};

type Body = {
  request_id?: string;
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
    const rawRole = String(payload.role || "").toLowerCase();
    const appRole = String(payload.app_role || "").toLowerCase();
    const resolvedRole = rawRole === "authenticated" ? appRole : rawRole;
    const role = resolvedRole as Role;
    const active_totvs_id = String(payload.active_totvs_id || "");

    if (!user_id || !active_totvs_id) return null;
    if (!["admin", "pastor", "obreiro", "secretario", "financeiro"].includes(role)) return null;

    return { user_id, role, active_totvs_id };
  } catch {
    return null;
  }
}

const PT_MONTHS = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

function formatDMY(s: string): string {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatExtended(isoStr: string): string {
  const m = String(isoStr || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return isoStr;
  return `${parseInt(m[3], 10)} de ${PT_MONTHS[parseInt(m[2], 10) - 1]} de ${m[1]}`;
}

function churchNameOnly(text: string): string {
  const idx = text.indexOf(" - ");
  return idx >= 0 ? text.slice(idx + 3).trim() : text.trim();
}

function parseTotvsFromText(value: string): string {
  const m = String(value || "").trim().match(/^(\d{3,})\b/);
  return m ? m[1] : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);
    if (session.role === "obreiro") return json({ ok: false, error: "forbidden" }, 403);

    const body = (await req.json().catch(() => ({}))) as Body;
    const request_id = String(body.request_id || "").trim();
    if (!request_id) return json({ ok: false, error: "missing_request_id" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data: reqRow, error: reqErr } = await sb
      .from("release_requests")
      .select("id, church_totvs_id, letter_id, requester_user_id, status")
      .eq("id", request_id)
      .maybeSingle();

    if (reqErr) return json({ ok: false, error: "db_error_request", details: reqErr.message }, 500);
    if (!reqRow) return json({ ok: false, error: "request_not_found" }, 404);

    if (String(reqRow.church_totvs_id) !== String(session.active_totvs_id)) {
      return json({ ok: false, error: "forbidden_wrong_church" }, 403);
    }
    if (String(reqRow.status) !== "PENDENTE") {
      return json({ ok: false, error: "request_not_pending", status: reqRow.status }, 409);
    }

    const { data: letter, error: letterErr } = await sb
      .from("letters")
      .select("id, church_totvs_id, status, storage_path, preacher_name, preacher_user_id, minister_role, preach_date, preach_period, church_origin, church_destination, phone, email, signer_user_id, signer_totvs_id, created_at")
      .eq("id", reqRow.letter_id)
      .maybeSingle();

    if (letterErr) return json({ ok: false, error: "db_error_letter", details: letterErr.message }, 500);
    if (!letter) return json({ ok: false, error: "letter_not_found" }, 404);

    if (String(letter.church_totvs_id) !== String(session.active_totvs_id)) {
      return json({ ok: false, error: "forbidden_wrong_church_letter" }, 403);
    }

    const { data: reqUpdated, error: updReqErr } = await sb
      .from("release_requests")
      .update({ status: "APROVADO" })
      .eq("id", request_id)
      .select("id, status, updated_at")
      .single();
    if (updReqErr) return json({ ok: false, error: "db_error_update_request", details: updReqErr.message }, 500);

    const { data: letterUpdated, error: updLetterErr } = await sb
      .from("letters")
      .update({ status: "LIBERADA" })
      .eq("id", reqRow.letter_id)
      .select("id, status, updated_at")
      .single();
    if (updLetterErr) return json({ ok: false, error: "db_error_update_letter", details: updLetterErr.message }, 500);

    // Notificacao para o solicitante
    await sb.from("notifications").insert({
      church_totvs_id: session.active_totvs_id,
      user_id: reqRow.requester_user_id,
      title: "Carta liberada",
      message: `Sua carta de ${letter.preacher_name || "pregacao"} foi liberada.`,
      type: "release_approved",
      read_at: null,
    });

    // Variáveis para registrar o resultado do webhook no response (facilita debug)
    let n8nFired = false;
    let n8nStatus = 0;
    let n8nError: string | null = null;

    // Dispara o webhook N8N para gerar o PDF agora que a carta foi liberada manualmente
    try {
      if (!N8N_WEBHOOK_URL) throw new Error("missing_n8n_letter_webhook_url");
      // Extrai os IDs necessários da carta para buscar dados completos
      const churchTotvs = String(letter.church_totvs_id || "");
      const signerTotvs = String(letter.signer_totvs_id || "");
      const signerUserId = String(letter.signer_user_id || "");
      const preacherUserId = String(letter.preacher_user_id || "");
      const churchOrigin = String(letter.church_origin || "");
      const churchDestination = String(letter.church_destination || "");

      // Extrai o número TOTVS da string de destino (ex: "9639 - PEDRA AZUL" → "9639")
      const destinationTotvs = parseTotvsFromText(churchDestination);

      // Busca em paralelo: igrejas de origem/assinante, dados do pastor, dados do pregador
      const [churchesRes, signerRes, preacherRes] = await Promise.all([
        sb.from("churches")
          .select("totvs_id,church_name,stamp_church_url,address_city,address_state")
          .in("totvs_id", [churchTotvs, signerTotvs].filter(Boolean)),

        // Busca dados do pastor que assina a carta
        signerUserId
          ? sb.from("users").select("id,full_name,phone,signature_url,stamp_pastor_url").eq("id", signerUserId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),

        // Busca data de separação e status de cadastro do pregador (inclui default_totvs_id para resolver pastor local)
        preacherUserId
          ? sb.from("users").select("id,data_separacao,registration_status,default_totvs_id").eq("id", preacherUserId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      const churchRows = (churchesRes.data || []) as Record<string, unknown>[];
      const originChurch = churchRows.find((c) => String(c.totvs_id) === churchTotvs) || null;
      const signerChurch = churchRows.find((c) => String(c.totvs_id) === signerTotvs) || null;
      const pastorUser = (signerRes.data as Record<string, unknown> | null) || null;
      const preacherUser = (preacherRes.data as Record<string, unknown> | null) || null;

      const preacherDataSeparacao = String(preacherUser?.data_separacao || "").trim() || null;
      const preacherRegistrationStatus = String(preacherUser?.registration_status || "").trim() || null;
      const statusUsuario = preacherRegistrationStatus === "PENDENTE" ? "PENDENTE" : "AUTORIZADO";

      // Resolução automática do pastor local via service_role (sem limitação de RLS)
      let resolvedPastorLocalName = "";
      let resolvedPastorLocalPhone = "";
      let resolvedPastorLocalEmail = "";

      const preacherLocalTotvs = String(preacherUser?.default_totvs_id || "").trim();
      if (preacherLocalTotvs) {
        const { data: churchRow } = await sb
          .from("churches")
          .select("pastor_user_id")
          .eq("totvs_id", preacherLocalTotvs)
          .maybeSingle();
        const pastorUserId = String((churchRow as Record<string, unknown> | null)?.pastor_user_id || "").trim();
        if (pastorUserId) {
          const { data: pastorRow } = await sb
            .from("users")
            .select("full_name, phone, email")
            .eq("id", pastorUserId)
            .maybeSingle();
          if (pastorRow) {
            resolvedPastorLocalName = String((pastorRow as Record<string, unknown>).full_name || "");
            resolvedPastorLocalPhone = String((pastorRow as Record<string, unknown>).phone || "");
            resolvedPastorLocalEmail = String((pastorRow as Record<string, unknown>).email || "");
          }
        }
      }

      // Define destinatário e status_carta: se há pastor local, envia para ele; senão, para o membro
      const membroNome = String(letter.preacher_name || "");
      const membroTelefone = String(letter.phone || "");
      const targetNome = resolvedPastorLocalName || membroNome;
      const targetTelefone = resolvedPastorLocalName ? resolvedPastorLocalPhone : membroTelefone;
      const finalStatusCarta = resolvedPastorLocalName ? "LIBERADA_PARA_PASTOR" : "LIBERADA_PARA_MEMBRO";

      // URL pública de verificação da carta (para QR Code impresso na carta)
      const appBaseUrl = String(Deno.env.get("APP_BASE_URL") || "https://sistem-ipda.vercel.app").replace(/\/$/, "");
      const verifyUrl = `${appBaseUrl}/validar-carta?id=${String(letter.id || "")}`;

      // Monta o payload completo para o N8N gerar o PDF
      const n8nPayload = {
        letter_id: letter.id,
        nome: targetNome,
        telefone: targetTelefone,
        igreja_origem: churchOrigin,
        origem: churchOrigin,
        igreja_destino: churchDestination,
        dia_pregacao: formatDMY(String(letter.preach_date || "")),
        data_emissao: formatExtended(String(letter.created_at || "")),
        origem_totvs: churchTotvs,
        destino_totvs: destinationTotvs,
        origem_nome: originChurch ? String(originChurch.church_name || "") : churchNameOnly(churchOrigin),
        destino_nome: churchNameOnly(churchDestination),
        email: String(letter.email || ""),
        ministerial: String(letter.minister_role || ""),
        data_separacao: preacherDataSeparacao ? formatDMY(preacherDataSeparacao) : "",
        pastor_responsavel: String(pastorUser?.full_name || ""),
        telefone_pastor: String(pastorUser?.phone || ""),
        assinatura_url: String(pastorUser?.signature_url || ""),
        carimbo_igreja_url: String(signerChurch?.stamp_church_url || ""),
        carimbo_pastor_url: String(pastorUser?.stamp_pastor_url || ""),
        cidade_igreja: String(originChurch?.address_city || ""),
        uf_igreja: String(originChurch?.address_state || ""),
        status_usuario: statusUsuario,
        status_carta: finalStatusCarta,
        membro_nome: membroNome,
        membro_telefone: membroTelefone,
        pastor_local_nome: resolvedPastorLocalName,
        pastor_local_telefone: resolvedPastorLocalPhone,
        pastor_local_email: resolvedPastorLocalEmail,
        client_id: churchTotvs,
        obreiro_id: preacherUserId,
        verify_url: verifyUrl,
      };

      // Envia para o N8N gerar e enviar o PDF ao obreiro
      const webhookResp = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(n8nPayload),
      });

      n8nFired = true;
      n8nStatus = webhookResp.status;
    } catch (e) {
      // Salva o erro mas NÃO reverte a aprovação — a carta continua liberada
      n8nError = String(e);
    }

    // Retorna o resultado incluindo info do webhook para facilitar debug
    return json({ ok: true, request: reqUpdated, letter: letterUpdated, n8n: { fired: n8nFired, status: n8nStatus, error: n8nError } }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
