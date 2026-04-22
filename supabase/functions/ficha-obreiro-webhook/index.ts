import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

type Role = "admin" | "pastor" | "obreiro" | "secretario" | "financeiro";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };

function toText(value: unknown) {
  return String(value || "").trim();
}

function digitsOnly(value: unknown) {
  return toText(value).replace(/\D/g, "");
}

function formatCpf(value: unknown) {
  const d = digitsOnly(value).slice(0, 11);
  if (d.length !== 11) return toText(value);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatCep(value: unknown) {
  const d = digitsOnly(value).slice(0, 8);
  if (d.length !== 8) return toText(value);
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function formatDateBr(value: unknown) {
  const raw = toText(value);
  if (!raw) return "";
  const iso = raw.slice(0, 10);
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return raw;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function monthNamePt(monthIndex: number) {
  const arr = [
    "JANEIRO",
    "FEVEREIRO",
    "MARCO",
    "ABRIL",
    "MAIO",
    "JUNHO",
    "JULHO",
    "AGOSTO",
    "SETEMBRO",
    "OUTUBRO",
    "NOVEMBRO",
    "DEZEMBRO",
  ];
  return arr[Math.max(0, Math.min(11, monthIndex))] || "";
}

function buildDateParts(dados: Record<string, unknown>) {
  const now = new Date();
  const cidade = toText(dados.data_termo_cidade);
  const dia = toText(dados.data_termo_dia || now.getDate());
  const mes = toText(dados.data_termo_mes || monthNamePt(now.getMonth()));
  const ano = toText(dados.data_termo_ano || now.getFullYear());
  return { cidade, dia, mes, ano };
}

function sanitizeDadosForWebhook(dados: Record<string, unknown>) {
  const copy = { ...dados };
  delete copy.assinatura_pastor_url;
  delete copy.assinatura_obreiro;
  delete copy.assinatura_obreiro_url;
  delete copy.assinatura_dirigente;
  delete copy.assinatura_dirigente_url;
  return copy;
}

function buildHtmlData(
  dados: Record<string, unknown>,
  member: Record<string, unknown>,
  church: Record<string, unknown> | null,
) {
  const dateParts = buildDateParts(dados);
  const nome = toText(dados.nome_completo || member.full_name);
  const enderecoBase = toText(dados.endereco || member.address_street);
  const numeroBase = toText(dados.numero || member.address_number);
  const bairroBase = toText(dados.bairro || member.address_neighborhood);
  const cidadeBase = toText(dados.cidade || member.address_city);
  const ufBase = toText(dados.estado || member.address_state).toUpperCase();
  const cepBase = formatCep(dados.cep || dados.cep_membro || member.cep);
  const funcaoPrincipal = toText(dados.compromisso_funcao || dados.funcao_ministerial || member.minister_role);
  const funcaoMinSec = toText(dados.funcao_ministerial_secundaria || funcaoPrincipal);

  return {
    // imagens
    foto_obreiro_url: toText(dados.foto_3x4_url || member.avatar_url),

    // doc1 p1
    nome,
    endereco: enderecoBase,
    numero: numeroBase,
    complemento: toText(dados.complemento || member.address_complement),
    bairro: bairroBase,
    cidade: cidadeBase,
    uf: ufBase,
    cep: cepBase,
    rg: toText(dados.rg || member.rg),
    cpf: formatCpf(dados.cpf || member.cpf),
    passaporte: toText(dados.passaporte),
    cidade_nasc: toText(dados.cidade_nascimento),
    uf_nasc: toText(dados.uf_nascimento).toUpperCase(),
    data_nasc: formatDateBr(dados.data_nascimento || member.birth_date),
    estado_civil: toText(dados.estado_civil || member.marital_status),
    data_casamento: formatDateBr(dados.data_casamento),
    fone: toText(dados.telefone || member.phone),
    email: toText(dados.email || member.email),
    alguma_doenca: toText(dados.alguma_doenca || dados.doenca_familia),
    qual_obreiro: toText(dados.qual_obreiro || dados.doenca_familia_qual),
    pai: toText(dados.nome_pai),
    mae: toText(dados.nome_mae),
    profissao: toText(dados.profissao || member.profession),
    ocupacao: toText(dados.ocupacao_atual),
    tem_filho: toText(dados.tem_filhos),
    dependente: toText(dados.dependentes_qtd),
    filho1: toText(dados.filho1_nome),
    data_filho1: formatDateBr(dados.filho1_nascimento),
    filho2: toText(dados.filho2_nome),
    data_filho2: formatDateBr(dados.filho2_nascimento),
    filho3: toText(dados.filho3_nome),
    data_filho3: formatDateBr(dados.filho3_nascimento),
    alguma_filho: toText(dados.doenca_familia),
    f_quem: toText(dados.doenca_familia_qual),
    qual_doenca_filho: toText(dados.doenca_familia_qual),
    nome_esposa: toText(dados.nome_conjuge),
    data_n_espo: formatDateBr(dados.conjuge_nascimento),
    rg_esposa: toText(dados.conjuge_rg),
    cpf_esposa: formatCpf(dados.conjuge_cpf),
    e_crente: toText(dados.conjuge_e_crente),
    qual_espo: toText(dados.conjuge_outro_ministerio),
    obreiro_aceitou_jesus: toText(dados.denominacao_aceitou_jesus),
    data_conver: formatDateBr(dados.data_conversao),
    data_batismo: formatDateBr(dados.data_batismo_aguas || dados.data_batismo || member.baptism_date),
    funcao: funcaoMinSec || funcaoPrincipal,
    orde_coop: formatDateBr(dados.ordenacao_cooperador),
    orde_diaco: formatDateBr(dados.ordenacao_diacono),
    orde_presb: formatDateBr(dados.ordenacao_presbitero),
    orde_finan: formatDateBr(dados.ordenacao_voluntario),
    orde_evange: formatDateBr(dados.ordenacao_evangelista),
    possui_credencial: toText(dados.possui_credencial),
    prebenda: toText(dados.recebe_prebenda),
    ha_quanto_tempo: toText(dados.prebenda_tempo),
    desde: toText(dados.prebenda_desde),
    voce_dirige: toText(dados.dirige_alguma_ipda),
    dirige_qual: toText(dados.dirige_ipda_qual),
    congregacao: toText(dados.endereco_atual_congregacao || dados.congregacao_endereco),
    bairro_congre: toText(dados.bairro_congregacao || dados.congregacao_bairro),
    cidade_congre: toText(dados.cidade_congregacao || dados.congregacao_cidade),
    uf_congre: toText(dados.uf_congregacao).toUpperCase(),
    cep_congre: formatCep(dados.cep_congregacao),
    dirigente_da_congre: toText(dados.dirigente_congregacao),
    tel_do_dirigente: toText(dados.tel_congregacao),
    sede_setorial: toText(dados.sede_setorial),
    sucursal: toText(dados.sucursal),

    // doc1 p2
    ja_dirigiu_no_exterior: toText(dados.ja_dirigiu_exterior),
    qual_cidade: toText(dados.cidades_exterior),
    qual_pais: toText(dados.paises_exterior),
    acima: toText(dados.doenca_exterior),
    quem_exterio: toText(dados.doenca_exterior_quem),
    quais_exterior: toText(dados.doenca_exterior_quais),
    qual_motivo_exterior: toText(dados.motivo_volta_brasil),
    idioma: toText(dados.idioma_fluente),
    qual_idioma: toText(dados.idioma_quais),
    grau_escola: toText(dados.escolaridade),
    em_qual_ano: toText(dados.desempenho_ano),
    disciplinado: toText(dados.foi_disciplinado),
    quantas_disciplinado: toText(dados.disciplinado_quantas_vezes),
    motivo: toText(dados.disciplinado_motivo),
    curso: toText(dados.curso_ministerial),
    qual_curso: toText(dados.curso_ministerial_qual),
    ano1: toText(dados.historico_gestao_1_ano),
    ipda1: toText(dados.historico_gestao_1_ipda),
    uf_igreja1: toText(dados.historico_gestao_1_uf).toUpperCase(),
    tempo1: toText(dados.historico_gestao_1_tempo),
    ano2: toText(dados.historico_gestao_2_ano),
    ipda2: toText(dados.historico_gestao_2_ipda),
    uf_igreja2: toText(dados.historico_gestao_2_uf).toUpperCase(),
    tempo2: toText(dados.historico_gestao_2_tempo),
    ano3: toText(dados.historico_gestao_3_ano),
    ipda3: toText(dados.historico_gestao_3_ipda),
    uf_igreja3: toText(dados.historico_gestao_3_uf).toUpperCase(),
    tempo3: toText(dados.historico_gestao_3_tempo),
    ano4: "",
    ipda4: "",
    uf_igreja4: "",
    tempo4: "",
    ano5: "",
    ipda5: "",
    uf_igreja5: "",
    tempo5: "",
    ano6: "",
    ipda6: "",
    uf_igreja6: "",
    tempo6: "",
    cidade_ass1: dateParts.cidade,
    dia_ass1: dateParts.dia,
    mes_ass1: dateParts.mes,
    ano_ass1: dateParts.ano,
    observacao2: toText(dados.observacoes_termo),

    // doc2
    nacionalidade: toText(dados.nacionalidade),
    data_congregacao: formatDateBr(dados.data_batismo_aguas || dados.data_batismo || member.baptism_date),
    estado: ufBase,
    recebe_prebenda: toText(dados.recebe_prebenda),
    data_inicio: toText(dados.prebenda_desde),
    ultimo_endereco: `${enderecoBase}${numeroBase ? `, ${numeroBase}` : ""}`.trim(),
    endereco_atual: toText(dados.endereco_atual_congregacao || dados.congregacao_endereco),
    cidade_end: toText(dados.cidade_congregacao || dados.congregacao_cidade || cityFromChurch(church)),
    estado_end: toText(dados.uf_congregacao || ufFromChurch(church)).toUpperCase(),
    pais: "Brasil",
    telefone: toText(dados.tel_congregacao || dados.telefone || member.phone),

    // doc3
    rua_igreja: toText(dados.congregacao_endereco || dados.endereco_atual_congregacao),
    numero_igreja: toText(dados.congregacao_numero),
    bairro_igreja: toText(dados.congregacao_bairro || dados.bairro_congregacao),
    cidade_igreja: toText(dados.congregacao_cidade || dados.cidade_congregacao),
    antiga_sede: toText(dados.antiga_sede_central),
    cidade_ass: dateParts.cidade,
    dia_ass: dateParts.dia,
    mes_ass: dateParts.mes,
    ano_ass: dateParts.ano,
  };
}

function cityFromChurch(church: Record<string, unknown> | null) {
  return toText(church?.address_city);
}

function ufFromChurch(church: Record<string, unknown> | null) {
  return toText(church?.address_state);
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

function pickUrlFromPayload(payload: unknown): string | null {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const nested = pickUrlFromPayload(item);
      if (nested) return nested;
    }
    return null;
  }
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
  for (const value of Object.values(obj)) {
    const nested = pickUrlFromPayload(value);
    if (nested) return nested;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "submit").trim().toLowerCase();
    const memberId = String(body.member_id || "").trim();
    const rawChurchTotvs = String(body.church_totvs_id || "").trim();
    if (!memberId) return json({ ok: false, error: "missing_member_id" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data: member, error: memberErr } = await sb
      .from("users")
      .select("id, default_totvs_id, full_name, cpf, rg, phone, email, minister_role, birth_date, baptism_date, marital_status, profession, cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, avatar_url")
      .eq("id", memberId)
      .maybeSingle();
    if (memberErr) return json({ ok: false, error: "db_error_member" }, 500);
    if (!member) return json({ ok: false, error: "member_not_found" }, 404);

    const churchTotvsId = rawChurchTotvs || String(member.default_totvs_id || "");
    if (!churchTotvsId) return json({ ok: false, error: "missing_church_totvs_id" }, 400);
    if (String(member.default_totvs_id || "") !== churchTotvsId) {
      return json({ ok: false, error: "forbidden_wrong_church" }, 403);
    }

    if (action === "status") {
      if (!["admin", "pastor", "secretario", "obreiro"].includes(session.role)) {
        return json({ ok: false, error: "forbidden" }, 403);
      }

      const { data: row, error: rowErr } = await sb
        .from("member_ficha_obreiro_forms")
        .select("id, status, url, error_message, sent_at, processed_at, created_at, updated_at")
        .eq("member_id", memberId)
        .eq("church_totvs_id", churchTotvsId)
        .maybeSingle();
      if (rowErr) return json({ ok: false, error: "db_error_form_status" }, 500);

      if (!row) {
        return json({ ok: true, ficha_obreiro: null }, 200);
      }

      const rawStatus = String((row as Record<string, unknown>).status || "").trim().toUpperCase();
      const normalizedStatus = rawStatus === "PROCESSADO" ? "PRONTO" : rawStatus;

      return json({
        ok: true,
        ficha_obreiro: {
          id: String((row as Record<string, unknown>).id || ""),
          status: normalizedStatus,
          status_raw: rawStatus,
          url: String((row as Record<string, unknown>).url || "").trim() || null,
          error_message: String((row as Record<string, unknown>).error_message || "").trim() || null,
          sent_at: (row as Record<string, unknown>).sent_at || null,
          processed_at: (row as Record<string, unknown>).processed_at || null,
          created_at: (row as Record<string, unknown>).created_at || null,
          updated_at: (row as Record<string, unknown>).updated_at || null,
        },
      }, 200);
    }

    if (!["admin", "pastor", "secretario"].includes(session.role)) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const dadosRaw = ((body.dados || {}) as Record<string, unknown>);
    const dados = sanitizeDadosForWebhook(dadosRaw);

    const { data: church, error: churchErr } = await sb
      .from("churches")
      .select("totvs_id, church_name, class, parent_totvs_id, address_street, address_number, address_neighborhood, address_city, address_state, cep")
      .eq("totvs_id", churchTotvsId)
      .maybeSingle();
    if (churchErr) return json({ ok: false, error: "db_error_church" }, 500);

    const prefillSnapshot = {
      member,
      church: church || null,
      session: {
        user_id: session.user_id,
        role: session.role,
        active_totvs_id: session.active_totvs_id,
      },
    };

    const baseUpsert = {
      member_id: memberId,
      church_totvs_id: churchTotvsId,
      requested_by_user_id: session.user_id,
      status: "ENVIADO_WEBHOOK",
      form_payload: dados,
      prefill_snapshot: prefillSnapshot,
      webhook_response: {},
      error_message: null,
      sent_at: new Date().toISOString(),
      processed_at: null,
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: upsertErr } = await sb
      .from("member_ficha_obreiro_forms")
      .upsert(baseUpsert, { onConflict: "member_id,church_totvs_id" })
      .select("id")
      .single();
    if (upsertErr) return json({ ok: false, error: "db_error_upsert_form" }, 500);

    const webhookUrl =
      String(Deno.env.get("FICHA_OBREIRO_WEBHOOK_URL") || "").trim() ||
      "https://n8n-n8n.ynlng8.easypanel.host/webhook/ficha-obreiro";

    const htmlData = buildHtmlData(
      dados,
      (member as Record<string, unknown>) || {},
      (church as Record<string, unknown>) || null,
    );

    const webhookPayload = {
      submission_id: String(saved?.id || ""),
      member_id: memberId,
      church_totvs_id: churchTotvsId,
      dados,
      prefill: prefillSnapshot,
      html_data: htmlData,
    };

    let responseData: unknown = null;
    try {
      const resp = await fetch(webhookUrl, {
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
          .from("member_ficha_obreiro_forms")
          .update({
            status: "ERRO",
            error_message: `webhook_failed_${resp.status}`,
            webhook_response: responseData as Record<string, unknown>,
            updated_at: new Date().toISOString(),
          })
          .eq("id", String(saved?.id || ""));
        return json({ ok: false, error: "webhook_failed", status: resp.status, response: responseData }, 502);
      }
    } catch {
      await sb
        .from("member_ficha_obreiro_forms")
        .update({
          status: "ERRO",
          error_message: "webhook_unreachable",
          updated_at: new Date().toISOString(),
        })
        .eq("id", String(saved?.id || ""));
      return json({ ok: false, error: "webhook_unreachable" }, 502);
    }

    const fileUrl = pickUrlFromPayload(responseData);
    await sb
      .from("member_ficha_obreiro_forms")
      .update({
        status: "PROCESSADO",
        webhook_response: responseData as Record<string, unknown>,
        url: fileUrl,
        processed_at: new Date().toISOString(),
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", String(saved?.id || ""));

    return json({
      ok: true,
      id: String(saved?.id || ""),
      url: fileUrl,
      response: responseData,
    });
  } catch {
    return json({ ok: false, error: "exception" }, 500);
  }
});
