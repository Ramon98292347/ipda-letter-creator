/**
 * public-verify-letter
 * ====================
 * Edge Function PÚBLICA (sem autenticação) para verificação de autenticidade
 * de cartas de pregação via QR Code.
 *
 * Aceita: GET /public-verify-letter?id=UUID_DA_CARTA
 *
 * Retorna os dados públicos da carta, do pregador e a URL da ficha em PDF.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, apikey",
  };
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders() });
}

const INVALID_STATUSES = new Set(["EXCLUIDA", "BLOQUEADO", "CANCELADA"]);

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "GET") return json({ success: false, error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  const letterId = url.searchParams.get("id")?.trim() || "";

  if (!letterId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(letterId)) {
    return json({
      success: false,
      valid: false,
      error: "invalid_or_missing_id",
      message: "ID da carta inválido ou não informado.",
    }, 400);
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Busca dados da carta
  const { data: letterRaw, error: letterErr } = await sb
    .from("letters")
    .select(
      "id, preacher_name, minister_role, church_origin, church_destination, preach_date, preach_period, status, created_at, preacher_user_id, phone, email",
    )
    .eq("id", letterId)
    .maybeSingle();

  if (letterErr) {
    return json({ success: false, valid: false, error: "db_error", message: "Erro ao consultar o banco de dados." }, 500);
  }

  if (!letterRaw) {
    return json({
      success: true,
      valid: false,
      status: null,
      message: "Carta não encontrada em nosso sistema.",
    }, 200);
  }

  const letter = letterRaw as Record<string, unknown>;
  const status = String(letter.status || "");

  // Carta cancelada ou bloqueada é considerada inválida
  if (INVALID_STATUSES.has(status)) {
    return json({
      success: true,
      valid: false,
      status,
      message: "Esta carta foi cancelada ou bloqueada e não é mais válida.",
    }, 200);
  }

  // Verifica se a carta está Vencida
  let isExpired = false;
  const preachDateStr = String(letter.preach_date || "");
  if (preachDateStr) {
    const now = new Date();
    // Ajuste de fuso horário para UTC-3 (Horário de Brasília)
    const brTime = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const todayStr = brTime.toISOString().split("T")[0]; // "YYYY-MM-DD"
    const preachDay = preachDateStr.split("T")[0]; // "YYYY-MM-DD"

    if (preachDay < todayStr) {
      isExpired = true;
    }
  }

  if (isExpired) {
    return json({
      success: true,
      valid: false,
      status: "VENCIDA",
      message: "Esta carta não é válida, pois a data autorizada para pregação já passou.",
    }, 200);
  }

  // Carta ainda não foi liberada
  const isValid = status === "LIBERADA" || status === "AUTORIZADO";

  // Busca dados do pregador (membro/obreiro)
  const preacherUserId = String(letter.preacher_user_id || "").trim();
  let member: Record<string, unknown> | null = null;
  let fichaUrl: string | null = null;

  if (preacherUserId) {
    const { data: memberRaw } = await sb
      .from("users")
      .select("id, full_name, cpf, phone, email, avatar_url")
      .eq("id", preacherUserId)
      .maybeSingle();

    if (memberRaw) {
      const m = memberRaw as Record<string, unknown>;
      member = {
        id: String(m.id || ""),
        full_name: String(m.full_name || letter.preacher_name || ""),
        cpf: m.cpf ? String(m.cpf) : null,
        phone: m.phone ? String(m.phone) : (letter.phone ? String(letter.phone) : null),
        email: m.email ? String(m.email) : (letter.email ? String(letter.email) : null),
        avatar_url: m.avatar_url ? String(m.avatar_url) : null,
      };

      // Busca a ficha do membro na tabela member_ficha_documents (status = PRONTO)
      // Usa a church_totvs_id da carta como referência da congregação
      const churchTotvsFromLetter = String(letter.church_totvs_id || "").trim();
      const fichaQuery = sb
        .from("member_ficha_documents")
        .select("final_url")
        .eq("member_id", preacherUserId)
        .eq("status", "PRONTO")
        .not("final_url", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1);

      // Filtra pela igreja da carta se disponível, senão pega qualquer pronta
      const { data: fichaRows } = churchTotvsFromLetter
        ? await fichaQuery.eq("church_totvs_id", churchTotvsFromLetter)
        : await fichaQuery;

      // Fallback: se não achou com a igreja específica, busca qualquer ficha pronta do membro
      if ((!fichaRows || fichaRows.length === 0) && churchTotvsFromLetter) {
        const { data: fichaFallback } = await sb
          .from("member_ficha_documents")
          .select("final_url")
          .eq("member_id", preacherUserId)
          .eq("status", "PRONTO")
          .not("final_url", "is", null)
          .order("updated_at", { ascending: false })
          .limit(1);
        const row = fichaFallback?.[0] as Record<string, unknown> | undefined;
        fichaUrl = row?.final_url ? String(row.final_url) : null;
      } else {
        const row = fichaRows?.[0] as Record<string, unknown> | undefined;
        fichaUrl = row?.final_url ? String(row.final_url) : null;
      }
    }
  }


  // Fallback de dados do membro a partir da própria carta (caso não haja user_id)
  if (!member) {
    member = {
      id: null,
      full_name: String(letter.preacher_name || ""),
      cpf: null,
      phone: letter.phone ? String(letter.phone) : null,
      email: letter.email ? String(letter.email) : null,
      avatar_url: null,
    };
  }

  return json({
    success: true,
    valid: isValid,
    status,
    letter: {
      id: String(letter.id || ""),
      preacher_name: String(letter.preacher_name || ""),
      minister_role: String(letter.minister_role || ""),
      church_origin: String(letter.church_origin || ""),
      church_destination: String(letter.church_destination || ""),
      preach_date: String(letter.preach_date || ""),
      preach_period: String(letter.preach_period || ""),
      created_at: String(letter.created_at || ""),
      status,
    },
    member,
    ficha_url: fichaUrl,
  });
});
