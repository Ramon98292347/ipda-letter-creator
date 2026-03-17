/**
 * set-letter-status
 * =================
 * O que faz: Altera o status de uma carta de pregação para qualquer valor válido
 *            (LIBERADA, BLOQUEADO, EXCLUIDA, AUTORIZADO, AGUARDANDO_LIBERACAO, ENVIADA).
 *            Quando o novo status é LIBERADA (e o anterior não era), dispara o webhook
 *            n8n para gerar o PDF da carta.
 * Para que serve: Usada pelo pastor/admin para liberar, bloquear ou excluir cartas manualmente
 *                 a partir da tabela de cartas no painel de gestão.
 * Quem pode usar: admin, pastor (somente cartas dentro do próprio escopo)
 * Recebe: { letter_id: string, status: string }
 * Retorna: { ok, letter, n8n: { fired, status, error } }
 * Observações: O webhook n8n só é disparado quando status muda PARA "LIBERADA" pela primeira vez
 *              (prevStatus != "LIBERADA") para evitar disparos duplicados.
 *              O erro no webhook não reverte a mudança de status da carta.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

const N8N_WEBHOOK_URL = "https://n8n-n8n.ynlng8.easypanel.host/webhook/carta-pregacao";

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
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };
type Body = { letter_id?: string; status?: string };

type ChurchRow = { totvs_id: string; parent_totvs_id: string | null };

async function verifySessionJWT(req: Request): Promise<SessionClaims | null> {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  const token = m[1].trim();
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
    if (!["admin", "pastor", "obreiro"].includes(role)) return null;
    return { user_id, role, active_totvs_id };
  } catch {
    return null;
  }
}

function computeScope(rootTotvs: string, churches: ChurchRow[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const c of churches) {
    const p = c.parent_totvs_id || "";
    if (!children.has(p)) children.set(p, []);
    children.get(p)!.push(String(c.totvs_id));
  }

  const scope = new Set<string>();
  const queue: string[] = [rootTotvs];

  while (queue.length) {
    const cur = queue.shift()!;
    if (scope.has(cur)) continue;
    scope.add(cur);
    for (const k of children.get(cur) || []) queue.push(k);
  }

  return scope;
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
    const letter_id = String(body.letter_id || "").trim();
    const status = String(body.status || "").trim().toUpperCase();

    if (!letter_id) return json({ ok: false, error: "missing_letter_id" }, 400);
    if (!["LIBERADA", "BLOQUEADO", "EXCLUIDA", "AUTORIZADO", "AGUARDANDO_LIBERACAO", "ENVIADA"].includes(status)) {
      return json({ ok: false, error: "invalid_status" }, 400);
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: letter, error: lErr } = await sb
      .from("letters")
      .select("id, church_totvs_id, status, preacher_name, preacher_user_id, minister_role, preach_date, preach_period, church_origin, church_destination, preacher_phone, phone, email, signer_user_id, signer_totvs_id, created_at")
      .eq("id", letter_id)
      .maybeSingle();

    if (lErr) return json({ ok: false, error: "db_error_letter", details: lErr.message }, 500);
    if (!letter) return json({ ok: false, error: "letter_not_found" }, 404);

    // Admin pode tudo. Pastor só no escopo (igreja ativa + filhas).
    if (session.role === "pastor") {
      const { data: allChurches, error: cErr } = await sb
        .from("churches")
        .select("totvs_id,parent_totvs_id");

      if (cErr) return json({ ok: false, error: "db_error_scope", details: cErr.message }, 500);

      const scope = computeScope(session.active_totvs_id, (allChurches || []) as ChurchRow[]);
      if (!scope.has(String(letter.church_totvs_id || ""))) {
        return json({ ok: false, error: "forbidden_wrong_scope" }, 403);
      }
    }

    const prevStatus = String(letter.status || "").toUpperCase();

    const { data: updated, error: uErr } = await sb
      .from("letters")
      .update({ status })
      .eq("id", letter_id)
      .select("id,status,updated_at")
      .single();

    if (uErr) return json({ ok: false, error: "db_error_update", details: uErr.message }, 500);

    // Armazena informações do webhook para retornar na resposta (útil para debug)
    let n8nFired = false;
    let n8nStatus = 0;
    let n8nError: string | null = null;

    // Dispara o webhook apenas quando a carta está sendo liberada pela primeira vez.
    // prevStatus != "LIBERADA" evita disparar duas vezes se o pastor clicar duas vezes.
    if (status === "LIBERADA" && prevStatus !== "LIBERADA") {
      try {
        // Lê os IDs importantes da carta para buscar dados completos
        const churchTotvs = String(letter.church_totvs_id || "");
        const signerTotvs = String(letter.signer_totvs_id || "");
        const signerUserId = String(letter.signer_user_id || "");
        const preacherUserId = String(letter.preacher_user_id || "");
        const churchOrigin = String(letter.church_origin || "");
        const churchDestination = String(letter.church_destination || "");

        // Extrai o número TOTVS da string de destino (ex: "9639 - PEDRA AZUL" → "9639")
        const destinationTotvs = parseTotvsFromText(churchDestination);

        // Busca em paralelo: igrejas de origem/assinante, dados do pastor assinante, dados do pregador
        const [churchesRes, signerRes, preacherRes] = await Promise.all([
          sb.from("churches")
            .select("totvs_id,church_name,stamp_church_url,address_city,address_state")
            .in("totvs_id", [churchTotvs, signerTotvs].filter(Boolean)),

          // Se tem pastor assinante, busca dados dele; senão retorna null
          signerUserId
            ? sb.from("users").select("id,full_name,phone,signature_url,stamp_pastor_url").eq("id", signerUserId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),

          // Se tem pregador, busca data de separação e status de cadastro dele
          preacherUserId
            ? sb.from("users").select("id,data_separacao,registration_status").eq("id", preacherUserId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        // Separa a lista de igrejas retornadas em: igreja de origem e igreja do assinante
        const churchRows = (churchesRes.data || []) as Record<string, unknown>[];
        const originChurch = churchRows.find((c) => String(c.totvs_id) === churchTotvs) || null;
        const signerChurch = churchRows.find((c) => String(c.totvs_id) === signerTotvs) || null;
        const pastorUser = (signerRes.data as Record<string, unknown> | null) || null;
        const preacherUser = (preacherRes.data as Record<string, unknown> | null) || null;

        // Define status do usuário: AUTORIZADO se aprovado, PENDENTE se pendente
        const preacherDataSeparacao = String(preacherUser?.data_separacao || "").trim() || null;
        const preacherRegistrationStatus = String(preacherUser?.registration_status || "").trim() || null;
        const statusUsuario = preacherRegistrationStatus === "PENDENTE" ? "PENDENTE" : "AUTORIZADO";

        // Monta o payload completo que será enviado ao N8N para gerar o PDF
        const n8nPayload = {
          letter_id: letter.id,
          nome: String(letter.preacher_name || ""),
          // Usa preacher_phone primeiro (telefone do pregador), fallback para phone
          telefone: String(letter.preacher_phone || letter.phone || ""),
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
          status_carta: "LIBERADA",
          client_id: churchTotvs,
          obreiro_id: preacherUserId,
        };

        // Envia o payload para o N8N gerar e enviar o PDF
        const webhookResp = await fetch(N8N_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(n8nPayload),
        });

        n8nFired = true;
        n8nStatus = webhookResp.status;
      } catch (e) {
        // Salva o erro para retornar na resposta (não reverte o status da carta)
        n8nError = String(e);
      }
    }

    // Retorna o resultado incluindo informação do webhook para facilitar debug
    return json({ ok: true, letter: updated, n8n: { fired: n8nFired, status: n8nStatus, error: n8nError } }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
