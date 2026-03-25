/**
 * fin-api
 * =======
 * O que faz: Edge Function multipropósito para o módulo financeiro.
 *            Recebe { action, ...params } e executa a ação correspondente
 *            sobre as tabelas financeiras (fin_transacoes, fin_categorias, etc).
 * Para que serve: Backend de todas as telas financeiras do sistema.
 * Quem pode usar: admin, pastor, secretario, financeiro
 * Recebe: { action, ...params } — cada action tem seus próprios parâmetros
 * Retorna: { ok: true, data: ... } em caso de sucesso
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

// Comentario: cabecalhos CORS necessarios para o navegador aceitar a resposta
function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  };
}

// Comentario: helper para retornar JSON com os cabecalhos corretos
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}

// Comentario: roles aceitos pelo modulo financeiro
type Role = "admin" | "pastor" | "obreiro" | "secretario" | "financeiro";

// Comentario: dados que extraimos do JWT de sessao do usuario
type SessionClaims = {
  user_id: string;
  role: Role;
  active_totvs_id: string;
  scope_totvs_ids?: string[];
};

// Comentario: verifica e decodifica o JWT do usuario; retorna null se invalido
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
    const scope_totvs_ids = Array.isArray(
      (payload as Record<string, unknown>).scope_totvs_ids,
    )
      ? ((payload as Record<string, unknown>).scope_totvs_ids as string[])
      : [];
    if (!user_id || !active_totvs_id) return null;
    // Comentario: apenas esses roles tem acesso ao modulo financeiro
    if (!["admin", "pastor", "secretario", "financeiro"].includes(role)) return null;
    return { user_id, role, active_totvs_id, scope_totvs_ids };
  } catch {
    return null;
  }
}

// Comentario: formata um valor numerico como moeda brasileira (R$ 1.234,56)
function formatBRL(value: number): string {
  return value.toFixed(2);
}

// Comentario: retorna o church_totvs_id que deve ser usado para filtrar dados.
// Admin pode passar um church_totvs_id especifico no body; os demais usam o do JWT.
function getChurchFilter(session: SessionClaims, body: Record<string, unknown>): string {
  if (session.role === "admin" && body.church_totvs_id) {
    return String(body.church_totvs_id);
  }
  return session.active_totvs_id;
}

// =============================================================================
// HANDLERS — cada funcao trata uma action especifica
// =============================================================================

// Comentario: retorna totais do mes atual para o dashboard financeiro
async function handleDashboard(
  sb: ReturnType<typeof createClient>,
  session: SessionClaims,
  body: Record<string, unknown>,
) {
  const churchId = getChurchFilter(session, body);

  // Comentario: calcula o primeiro e ultimo dia do mes atual
  const now = new Date();
  const anoAtual = now.getFullYear();
  const mesAtual = now.getMonth() + 1; // getMonth() retorna 0-11
  const inicioMes = `${anoAtual}-${String(mesAtual).padStart(2, "0")}-01`;
  const fimMes = new Date(anoAtual, mesAtual, 0); // dia 0 do proximo mes = ultimo dia do mes atual
  const fimMesStr = `${anoAtual}-${String(mesAtual).padStart(2, "0")}-${String(fimMes.getDate()).padStart(2, "0")}`;

  // Comentario: busca todas as transacoes do mes atual para essa igreja
  const { data, error } = await sb
    .from("fin_transacoes")
    .select("valor, tipo")
    .eq("church_totvs_id", churchId)
    .gte("data_transacao", inicioMes)
    .lte("data_transacao", fimMesStr);

  if (error) return json({ ok: false, error: "db_error", details: error.message }, 500);

  const transacoes = (data || []) as Array<{ valor: number; tipo: string }>;

  // Comentario: soma as receitas e despesas separadamente
  let total_receitas = 0;
  let total_despesas = 0;
  for (const t of transacoes) {
    const valor = Number(t.valor) || 0;
    if (t.tipo === "receita") total_receitas += valor;
    else if (t.tipo === "despesa") total_despesas += valor;
  }

  const saldo = total_receitas - total_despesas;
  const total_transacoes = transacoes.length;

  return json({
    ok: true,
    data: {
      total_receitas: formatBRL(total_receitas),
      total_despesas: formatBRL(total_despesas),
      saldo: formatBRL(saldo),
      total_transacoes,
      mes: mesAtual,
      ano: anoAtual,
    },
  });
}

// Comentario: lista transacoes com filtro opcional de mes e ano
async function handleListTransacoes(
  sb: ReturnType<typeof createClient>,
  session: SessionClaims,
  body: Record<string, unknown>,
) {
  const churchId = getChurchFilter(session, body);

  // Comentario: mes e ano sao opcionais — se nao passados, usa o mes atual
  const now = new Date();
  const mes = body.mes ? Number(body.mes) : now.getMonth() + 1;
  const ano = body.ano ? Number(body.ano) : now.getFullYear();

  // Comentario: monta o filtro de periodo
  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const fimMes = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;

  const { data, error } = await sb
    .from("fin_transacoes")
    .select("id, descricao, valor, tipo, data_transacao, categoria_id, observacoes, church_totvs_id, created_at")
    .eq("church_totvs_id", churchId)
    .gte("data_transacao", inicioMes)
    .lte("data_transacao", fimMes)
    .order("data_transacao", { ascending: false });

  if (error) return json({ ok: false, error: "db_error", details: error.message }, 500);

  return json({ ok: true, data: data || [] });
}

// Comentario: salva (cria ou atualiza) uma transacao financeira
// Somente roles "financeiro" e "admin" podem salvar
async function handleSaveTransacao(
  sb: ReturnType<typeof createClient>,
  session: SessionClaims,
  body: Record<string, unknown>,
) {
  // Comentario: verifica se o usuario tem permissao para salvar
  if (!["financeiro", "admin"].includes(session.role)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const churchId = getChurchFilter(session, body);
  const id = body.id ? String(body.id) : null;

  // Comentario: monta o objeto com os dados da transacao
  // user_id e obrigatorio (NOT NULL) — registra quem criou a transacao
  const payload: Record<string, unknown> = {
    descricao: String(body.descricao || ""),
    valor: Number(body.valor) || 0,
    tipo: String(body.tipo || "receita"),
    data_transacao: String(body.data_transacao || ""),
    categoria_id: body.categoria_id ? String(body.categoria_id) : null,
    observacoes: body.observacoes ? String(body.observacoes) : null,
    church_totvs_id: churchId,
    user_id: session.user_id,
  };

  let result;
  if (id) {
    // Comentario: UPDATE — so atualiza transacoes da propria igreja
    result = await sb
      .from("fin_transacoes")
      .update(payload)
      .eq("id", id)
      .eq("church_totvs_id", churchId)
      .select()
      .single();
  } else {
    // Comentario: INSERT — cria nova transacao
    result = await sb
      .from("fin_transacoes")
      .insert(payload)
      .select()
      .single();
  }

  if (result.error) return json({ ok: false, error: "db_error", details: result.error.message }, 500);
  return json({ ok: true, data: result.data });
}

// Comentario: exclui uma transacao financeira por ID
// Somente roles "financeiro" e "admin" podem deletar
async function handleDeleteTransacao(
  sb: ReturnType<typeof createClient>,
  session: SessionClaims,
  body: Record<string, unknown>,
) {
  if (!["financeiro", "admin"].includes(session.role)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const churchId = getChurchFilter(session, body);
  const id = String(body.id || "");
  if (!id) return json({ ok: false, error: "missing_id" }, 400);

  // Comentario: filtra pelo church_totvs_id para nao apagar registros de outras igrejas
  const { error } = await sb
    .from("fin_transacoes")
    .delete()
    .eq("id", id)
    .eq("church_totvs_id", churchId);

  if (error) return json({ ok: false, error: "db_error", details: error.message }, 500);
  return json({ ok: true });
}

// Comentario: lista as categorias financeiras ativas da igreja
async function handleListCategorias(
  sb: ReturnType<typeof createClient>,
  session: SessionClaims,
  body: Record<string, unknown>,
) {
  const churchId = getChurchFilter(session, body);

  const { data, error } = await sb
    .from("fin_categorias")
    .select("id, nome, tipo, cor, descricao")
    .eq("church_totvs_id", churchId)
    .eq("ativo", true)
    .order("nome", { ascending: true });

  if (error) return json({ ok: false, error: "db_error", details: error.message }, 500);
  return json({ ok: true, data: data || [] });
}

// Comentario: cria ou atualiza uma categoria financeira
async function handleSaveCategoria(
  sb: ReturnType<typeof createClient>,
  session: SessionClaims,
  body: Record<string, unknown>,
) {
  const churchId = getChurchFilter(session, body);
  const id = body.id ? String(body.id) : null;

  const payload: Record<string, unknown> = {
    nome: String(body.nome || ""),
    tipo: String(body.tipo || "receita"),
    cor: String(body.cor || "#3B82F6"),
    descricao: body.descricao ? String(body.descricao) : null,
    church_totvs_id: churchId,
    ativo: true,
  };

  let result;
  if (id) {
    result = await sb
      .from("fin_categorias")
      .update(payload)
      .eq("id", id)
      .eq("church_totvs_id", churchId)
      .select()
      .single();
  } else {
    result = await sb
      .from("fin_categorias")
      .insert(payload)
      .select()
      .single();
  }

  if (result.error) return json({ ok: false, error: "db_error", details: result.error.message }, 500);
  return json({ ok: true, data: result.data });
}

// Comentario: salva uma contagem de caixa com os itens em JSON e os responsáveis
async function handleSaveContagem(
  sb: ReturnType<typeof createClient>,
  session: SessionClaims,
  body: Record<string, unknown>,
) {
  if (!["financeiro", "admin"].includes(session.role)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const churchId = getChurchFilter(session, body);

  // Comentario: diferenca e calculada automaticamente pelo banco (coluna gerada)
  const saldo_sistema = Number(body.saldo_sistema) || 0;
  const saldo_contado = Number(body.saldo_contado) || 0;

  // Comentario: converte o array de itens para JSON limpo (apenas os campos necessários)
  const itens = Array.isArray(body.itens) ? body.itens : [];
  const itens_json = itens.map((item: Record<string, unknown>) => ({
    denominacao: String(item.denominacao || ""),
    tipo: String(item.tipo || "nota"),
    quantidade: Number(item.quantidade) || 0,
    valor_unitario: Number(item.valor_unitario) || 0,
  }));

  // Comentario: insere o registro da contagem com itens em JSON e responsáveis
  const { data: contagem, error: contagemError } = await sb
    .from("fin_contagens_caixa")
    .insert({
      church_totvs_id: churchId,
      data_contagem: String(body.data_contagem || ""),
      saldo_sistema,
      saldo_contado,
      observacoes: body.observacoes ? String(body.observacoes) : null,
      status: "fechada",
      user_id: session.user_id,
      // Comentario: todas as denominações ficam numa coluna JSONB — sem tabela de itens
      itens_json,
      responsavel_1: body.responsavel_1 ? String(body.responsavel_1) : null,
      responsavel_2: body.responsavel_2 ? String(body.responsavel_2) : null,
      responsavel_3: body.responsavel_3 ? String(body.responsavel_3) : null,
      // Comentario: tipo da coleta e valores por forma de pagamento
      tipo_coleta: body.tipo_coleta ? String(body.tipo_coleta) : null,
      valor_dinheiro: Number(body.valor_dinheiro) || 0,
      valor_pix: Number(body.valor_pix) || 0,
      valor_cartao: Number(body.valor_cartao) || 0,
    })
    .select()
    .single();

  if (contagemError) return json({ ok: false, error: "db_error_contagem", details: contagemError.message }, 500);

  return json({ ok: true, data: contagem });
}

// Comentario: lista as contagens de caixa com itens em JSON e responsáveis
async function handleListContagens(
  sb: ReturnType<typeof createClient>,
  session: SessionClaims,
  body: Record<string, unknown>,
) {
  const churchId = getChurchFilter(session, body);

  // Comentario: agora os itens ficam em itens_json (JSONB) — sem JOIN necessário
  const { data, error } = await sb
    .from("fin_contagens_caixa")
    .select(`
      id,
      data_contagem,
      saldo_sistema,
      saldo_contado,
      diferenca,
      observacoes,
      status,
      created_at,
      itens_json,
      responsavel_1,
      responsavel_2,
      responsavel_3,
      tipo_coleta,
      valor_dinheiro,
      valor_pix,
      valor_cartao
    `)
    .eq("church_totvs_id", churchId)
    .order("data_contagem", { ascending: false });

  if (error) return json({ ok: false, error: "db_error", details: error.message }, 500);
  return json({ ok: true, data: data || [] });
}

// Comentario: salva (ou atualiza) o fechamento mensal com todos os dados do relatório.
// Usa UPSERT — se já existe um fechamento para o mesmo mês/ano/igreja, ele é atualizado.
async function handleSaveFechamento(
  sb: ReturnType<typeof createClient>,
  session: SessionClaims,
  body: Record<string, unknown>,
) {
  if (!["financeiro", "admin"].includes(session.role)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const churchId = getChurchFilter(session, body);
  const now = new Date();

  const payload: Record<string, unknown> = {
    church_totvs_id: churchId,
    ano: Number(body.ano) || now.getFullYear(),
    mes: Number(body.mes) || now.getMonth() + 1,
    // Comentario: totais gerais
    total_receitas: Number(body.total_receitas) || 0,
    total_despesas: Number(body.total_despesas) || 0,
    total_transacoes: Number(body.total_transacoes) || 0,
    saldo_inicial_mes: Number(body.saldo_inicial_mes) || 0,
    saldo_final_mes: Number(body.saldo_final_mes) || 0,
    observacoes: body.observacoes ? String(body.observacoes) : null,
    // Comentario: quem fechou e quando
    fechado_por: session.user_id,
    fechado_em: now.toISOString(),
    status: "fechado",
    // Comentario: breakdown por tipo de coleta
    dizimos_dinheiro: Number(body.dizimos_dinheiro) || 0,
    dizimos_pix_cartao: Number(body.dizimos_pix_cartao) || 0,
    ofertas_dinheiro: Number(body.ofertas_dinheiro) || 0,
    ofertas_pix_cartao: Number(body.ofertas_pix_cartao) || 0,
    missionarias_dinheiro: Number(body.missionarias_dinheiro) || 0,
    missionarias_pix_cartao: Number(body.missionarias_pix_cartao) || 0,
    transferencia_mes_anterior: Number(body.transferencia_mes_anterior) || 0,
    // Comentario: responsáveis e data de fechamento do relatório
    responsavel_anterior: body.responsavel_anterior ? String(body.responsavel_anterior) : null,
    responsavel_atual: body.responsavel_atual ? String(body.responsavel_atual) : null,
    data_fechamento: body.data_fechamento ? String(body.data_fechamento) : null,
  };

  // Comentario: upsert — se já existe fechamento para esse mês/ano/igreja, atualiza
  const { data, error } = await sb
    .from("fin_fechamentos_mensais")
    .upsert(payload, { onConflict: "ano,mes,church_totvs_id" })
    .select()
    .single();

  if (error) return json({ ok: false, error: "db_error", details: error.message }, 500);
  return json({ ok: true, data });
}

// Comentario: salva (ou incrementa) a ficha diária do dia com o valor da contagem.
// Se já existe uma ficha para esse dia, adiciona o valor ao total_entradas existente.
// Se não existe, cria uma nova ficha com saldo_inicial = 0.
async function handleSaveFichaDiaria(
  sb: ReturnType<typeof createClient>,
  session: SessionClaims,
  body: Record<string, unknown>,
) {
  if (!["financeiro", "admin"].includes(session.role)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const churchId = getChurchFilter(session, body);
  const data_ficha = String(body.data_ficha || "");
  const valor_entrada = Number(body.valor_entrada) || 0;

  if (!data_ficha) return json({ ok: false, error: "missing_data_ficha" }, 400);

  // Comentario: busca se já existe ficha para esse dia e igreja
  const { data: existing, error: findError } = await sb
    .from("fin_fichas_diarias")
    .select("id, total_entradas")
    .eq("data_ficha", data_ficha)
    .eq("church_totvs_id", churchId)
    .maybeSingle();

  if (findError) return json({ ok: false, error: "db_error", details: findError.message }, 500);

  if (existing) {
    // Comentario: já existe — incrementa total_entradas com o novo valor
    const novoTotal = Number(existing.total_entradas) + valor_entrada;
    const { data, error } = await sb
      .from("fin_fichas_diarias")
      .update({ total_entradas: novoTotal })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) return json({ ok: false, error: "db_error", details: error.message }, 500);
    return json({ ok: true, data });
  } else {
    // Comentario: não existe — cria nova ficha para o dia
    const { data, error } = await sb
      .from("fin_fichas_diarias")
      .insert({
        church_totvs_id: churchId,
        data_ficha,
        user_id: session.user_id,
        saldo_inicial: 0,
        total_entradas: valor_entrada,
        total_saidas: 0,
        status: "aberta",
      })
      .select()
      .single();
    if (error) return json({ ok: false, error: "db_error", details: error.message }, 500);
    return json({ ok: true, data });
  }
}

// Comentario: lista as fichas diárias do mês (padrão: mês atual)
async function handleListFichasDiarias(
  sb: ReturnType<typeof createClient>,
  session: SessionClaims,
  body: Record<string, unknown>,
) {
  const churchId = getChurchFilter(session, body);
  const now = new Date();
  const mes = body.mes ? Number(body.mes) : now.getMonth() + 1;
  const ano = body.ano ? Number(body.ano) : now.getFullYear();

  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const fimMes = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;

  const { data, error } = await sb
    .from("fin_fichas_diarias")
    .select("id, data_ficha, saldo_inicial, total_entradas, total_saidas, saldo_final, observacoes, status, created_at")
    .eq("church_totvs_id", churchId)
    .gte("data_ficha", inicioMes)
    .lte("data_ficha", fimMes)
    .order("data_ficha", { ascending: true });

  if (error) return json({ ok: false, error: "db_error", details: error.message }, 500);
  return json({ ok: true, data: data || [] });
}

// Comentario: lista os fechamentos mensais da igreja, do mais recente para o mais antigo
async function handleListFechamentos(
  sb: ReturnType<typeof createClient>,
  session: SessionClaims,
  body: Record<string, unknown>,
) {
  const churchId = getChurchFilter(session, body);

  const { data, error } = await sb
    .from("fin_fechamentos_mensais")
    .select("id, ano, mes, total_receitas, total_despesas, saldo_final_mes, status, fechado_em, responsavel_atual")
    .eq("church_totvs_id", churchId)
    .order("ano", { ascending: false })
    .order("mes", { ascending: false });

  if (error) return json({ ok: false, error: "db_error", details: error.message }, 500);
  return json({ ok: true, data: data || [] });
}

// Comentario: pesquisa igrejas pelo nome ou codigo PDA (totvs_id)
async function handleSearchChurches(
  sb: ReturnType<typeof createClient>,
  _session: SessionClaims,
  body: Record<string, unknown>,
) {
  const query = String(body.query || "").trim();
  // Comentario: exige pelo menos 2 caracteres para evitar buscas muito amplas
  if (query.length < 2) return json({ ok: true, data: [] });

  const { data, error } = await sb
    .from("churches")
    .select("totvs_id, church_name, class, address_neighborhood, address_city, address_state, cep, contact_email")
    .or(`church_name.ilike.%${query}%,totvs_id.ilike.%${query}%`)
    .eq("is_active", true)
    .limit(10);

  if (error) return json({ ok: false, error: "db_error", details: error.message }, 500);
  return json({ ok: true, data: data || [] });
}

// =============================================================================
// ENTRY POINT — recebe a action e chama o handler correto
// =============================================================================
Deno.serve(async (req) => {
  // Comentario: responde ao preflight do CORS antes de qualquer verificacao
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    // Comentario: verifica se o usuario esta autenticado e tem permissao
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "");

    // Comentario: cria o cliente Supabase com as credenciais do servidor (service role)
    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    // Comentario: roteador de actions — cada action vai para seu handler especifico
    switch (action) {
      case "dashboard":
        return await handleDashboard(sb, session, body);
      case "list-transacoes":
        return await handleListTransacoes(sb, session, body);
      case "save-transacao":
        return await handleSaveTransacao(sb, session, body);
      case "delete-transacao":
        return await handleDeleteTransacao(sb, session, body);
      case "list-categorias":
        return await handleListCategorias(sb, session, body);
      case "save-categoria":
        return await handleSaveCategoria(sb, session, body);
      case "save-contagem":
        return await handleSaveContagem(sb, session, body);
      case "list-contagens":
        return await handleListContagens(sb, session, body);
      case "search-churches":
        return await handleSearchChurches(sb, session, body);
      case "save-fechamento":
        return await handleSaveFechamento(sb, session, body);
      case "list-fechamentos":
        return await handleListFechamentos(sb, session, body);
      case "save-ficha-diaria":
        return await handleSaveFichaDiaria(sb, session, body);
      case "list-fichas-diarias":
        return await handleListFichasDiarias(sb, session, body);
      default:
        return json({ ok: false, error: "unknown_action", action }, 400);
    }
  } catch {
    return json({ ok: false, error: "exception" }, 500);
  }
});
