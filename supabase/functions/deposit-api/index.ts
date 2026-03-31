/**
 * deposit-api
 * ===========
 * Edge Function para o modulo Deposito — controle de estoque de materiais
 * evangelisticos, livraria e mercadorias internas da igreja.
 *
 * Actions disponiveis:
 *   "list-products"     -> lista produtos cadastrados
 *   "create-product"    -> cria novo produto
 *   "update-product"    -> atualiza produto existente
 *   "list-stock"        -> lista estoque consolidado (produto + igreja)
 *   "get-summary"       -> retorna resumo/KPIs do deposito
 *   "create-movement"   -> registra entrada, saida, ajuste ou perda
 *   "create-transfer"   -> transferencia entre igrejas
 *   "list-movements"    -> historico de movimentacoes com filtros
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

// ---------------------------------------------------------------------------
// UTILITARIOS
// ---------------------------------------------------------------------------

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

type Role = "admin" | "pastor" | "obreiro" | "secretario" | "financeiro";

type SessionClaims = {
  user_id: string;
  role: Role;
  active_totvs_id: string;
};

// Comentario: verifica o token JWT customizado do sistema
async function verifySessionJWT(req: Request): Promise<SessionClaims | null> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const secret = Deno.env.get("USER_SESSION_JWT_SECRET");
  if (!secret) return null;
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    return {
      // Comentario: o campo do user_id no JWT customizado e "sub"
      user_id: String(payload.sub || ""),
      role: String(payload.role || "") as Role,
      active_totvs_id: String(payload.active_totvs_id || ""),
    };
  } catch {
    return null;
  }
}

// Comentario: computa escopo de igrejas (raiz + todas as filhas na hierarquia)
type ChurchRow = { totvs_id: string; parent_totvs_id: string | null };

function computeScope(rootTotvs: string, churches: ChurchRow[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const c of churches) {
    const p = c.parent_totvs_id || "";
    if (!children.has(p)) children.set(p, []);
    children.get(p)!.push(c.totvs_id);
  }
  const scope = new Set<string>();
  const queue: string[] = [rootTotvs];
  while (queue.length) {
    const cur = queue.shift()!;
    if (scope.has(cur)) continue;
    scope.add(cur);
    const kids = children.get(cur) || [];
    for (const k of kids) queue.push(k);
  }
  return scope;
}

// Comentario: resolve o escopo do usuario logado
async function resolveScope(sb: ReturnType<typeof createClient>, session: SessionClaims): Promise<Set<string>> {
  const { data: churches } = await sb.from("churches").select("totvs_id, parent_totvs_id");
  const rows = (churches || []) as ChurchRow[];
  if (session.role === "admin") {
    return new Set(rows.map((c) => c.totvs_id).filter(Boolean));
  }
  return computeScope(session.active_totvs_id, rows);
}

// ---------------------------------------------------------------------------
// HANDLER: list-products
// ---------------------------------------------------------------------------
async function handleListProducts(session: SessionClaims, body: Record<string, unknown>): Promise<Response> {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let q = sb.from("deposit_products")
    .select("*")
    .order("group_name")
    .order("description");

  // Comentario: filtros opcionais
  if (typeof body.is_active === "boolean") q = q.eq("is_active", body.is_active);
  if (body.group_name) q = q.eq("group_name", String(body.group_name));
  if (body.search) {
    const s = String(body.search).replace(/"/g, "").trim();
    if (s) q = q.or(`description.ilike.%${s}%,code.ilike.%${s}%`);
  }

  const { data, error } = await q;
  if (error) return json({ ok: false, error: "db_error", details: error.message }, 500);
  return json({ ok: true, products: data || [] });
}

// ---------------------------------------------------------------------------
// HANDLER: create-product
// ---------------------------------------------------------------------------
async function handleCreateProduct(session: SessionClaims, body: Record<string, unknown>): Promise<Response> {
  // Comentario: somente admin e pastor podem cadastrar produtos
  if (session.role !== "admin" && session.role !== "pastor") {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const code = String(body.code || "").trim();
  const description = String(body.description || "").trim();
  const group_name = String(body.group_name || "").trim();
  const subgroup = String(body.subgroup || "").trim() || null;
  const unit = String(body.unit || "UN").trim();
  const unit_price = Number(body.unit_price) || 0;
  const min_stock = Number(body.min_stock) || 0;
  const notes = String(body.notes || "").trim() || null;

  if (!code) return json({ ok: false, error: "missing_code" }, 400);
  if (!description) return json({ ok: false, error: "missing_description" }, 400);
  if (!group_name) return json({ ok: false, error: "missing_group" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data, error } = await sb.from("deposit_products").insert({
    code, description, group_name, subgroup, unit, unit_price, min_stock, notes,
  }).select().single();

  if (error) {
    if (error.message?.includes("duplicate")) return json({ ok: false, error: "code_already_exists" }, 409);
    return json({ ok: false, error: "db_error", details: error.message }, 500);
  }
  return json({ ok: true, product: data });
}

// ---------------------------------------------------------------------------
// HANDLER: update-product
// ---------------------------------------------------------------------------
async function handleUpdateProduct(session: SessionClaims, body: Record<string, unknown>): Promise<Response> {
  if (session.role !== "admin" && session.role !== "pastor") {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const id = String(body.id || "").trim();
  if (!id) return json({ ok: false, error: "missing_id" }, 400);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.description !== undefined) updates.description = String(body.description).trim();
  if (body.group_name !== undefined) updates.group_name = String(body.group_name).trim();
  if (body.subgroup !== undefined) updates.subgroup = String(body.subgroup || "").trim() || null;
  if (body.unit !== undefined) updates.unit = String(body.unit).trim();
  if (body.unit_price !== undefined) updates.unit_price = Number(body.unit_price) || 0;
  if (body.min_stock !== undefined) updates.min_stock = Number(body.min_stock) || 0;
  if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);
  if (body.notes !== undefined) updates.notes = String(body.notes || "").trim() || null;

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await sb.from("deposit_products").update(updates).eq("id", id).select().single();
  if (error) return json({ ok: false, error: "db_error", details: error.message }, 500);
  return json({ ok: true, product: data });
}

// ---------------------------------------------------------------------------
// HANDLER: list-stock — estoque consolidado com dados do produto
// ---------------------------------------------------------------------------
async function handleListStock(session: SessionClaims, body: Record<string, unknown>): Promise<Response> {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const scope = await resolveScope(sb, session);

  // Comentario: busca todos os produtos e o estoque de cada um nas igrejas do escopo
  const [productsRes, stockRes] = await Promise.all([
    sb.from("deposit_products").select("*").order("group_name").order("description"),
    sb.from("deposit_stock").select("*"),
  ]);

  if (productsRes.error) return json({ ok: false, error: "db_error", details: productsRes.error.message }, 500);

  const products = (productsRes.data || []) as Record<string, unknown>[];
  const stockRows = ((stockRes.data || []) as Record<string, unknown>[])
    .filter((s) => scope.has(String(s.church_totvs_id || "")));

  // Comentario: filtros opcionais
  const filterGroup = String(body.group_name || "").trim();
  const filterChurch = String(body.church_totvs_id || "").trim();
  const filterLowStock = Boolean(body.low_stock);
  const filterActive = body.is_active !== undefined ? Boolean(body.is_active) : null;
  const filterSearch = String(body.search || "").trim().toLowerCase();

  // Comentario: monta mapa de estoque por produto+igreja
  const stockMap = new Map<string, Record<string, unknown>[]>();
  for (const s of stockRows) {
    const pid = String(s.product_id || "");
    if (!stockMap.has(pid)) stockMap.set(pid, []);
    stockMap.get(pid)!.push(s);
  }

  // Comentario: consolida produtos com estoque
  const result = products.filter((p) => {
    if (filterActive !== null && Boolean(p.is_active) !== filterActive) return false;
    if (filterGroup && String(p.group_name) !== filterGroup) return false;
    if (filterSearch && !String(p.description || "").toLowerCase().includes(filterSearch) && !String(p.code || "").toLowerCase().includes(filterSearch)) return false;
    return true;
  }).map((p) => {
    const pid = String(p.id || "");
    let entries = stockMap.get(pid) || [];
    if (filterChurch) entries = entries.filter((s) => String(s.church_totvs_id) === filterChurch);

    const totalQuantity = entries.reduce((sum, s) => sum + Number(s.quantity || 0), 0);
    const minStock = Number(p.min_stock || 0);

    return {
      ...p,
      total_quantity: totalQuantity,
      is_low_stock: minStock > 0 && totalQuantity < minStock,
      stock_entries: entries,
    };
  });

  // Comentario: filtro final de estoque baixo
  const finalResult = filterLowStock ? result.filter((r) => r.is_low_stock) : result;

  return json({ ok: true, stock: finalResult, total: finalResult.length });
}

// ---------------------------------------------------------------------------
// HANDLER: get-summary — KPIs do deposito
// ---------------------------------------------------------------------------
async function handleGetSummary(session: SessionClaims, _body: Record<string, unknown>): Promise<Response> {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const scope = await resolveScope(sb, session);

  const [productsRes, stockRes, movementsRes] = await Promise.all([
    sb.from("deposit_products").select("id, min_stock, unit_price, is_active", { count: "exact" }).eq("is_active", true),
    sb.from("deposit_stock").select("product_id, church_totvs_id, quantity"),
    sb.from("deposit_movements").select("type, quantity, unit_price, created_at"),
  ]);

  const products = (productsRes.data || []) as Record<string, unknown>[];
  const stockRows = ((stockRes.data || []) as Record<string, unknown>[])
    .filter((s) => scope.has(String(s.church_totvs_id || "")));
  const movements = (movementsRes.data || []) as Record<string, unknown>[];

  // Comentario: calcula KPIs
  const totalProducts = products.length;

  // Comentario: estoque total (soma de todas as quantidades no escopo)
  const totalStock = stockRows.reduce((sum, s) => sum + Number(s.quantity || 0), 0);

  // Comentario: itens com estoque baixo
  const stockByProduct = new Map<string, number>();
  for (const s of stockRows) {
    const pid = String(s.product_id || "");
    stockByProduct.set(pid, (stockByProduct.get(pid) || 0) + Number(s.quantity || 0));
  }
  let lowStockCount = 0;
  for (const p of products) {
    const min = Number(p.min_stock || 0);
    if (min > 0) {
      const current = stockByProduct.get(String(p.id || "")) || 0;
      if (current < min) lowStockCount++;
    }
  }

  // Comentario: movimentacoes do mes atual
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthMovements = movements.filter((m) => String(m.created_at || "") >= monthStart);

  let entriesMonth = 0;
  let exitsMonth = 0;
  let transfersMonth = 0;
  for (const m of monthMovements) {
    const t = String(m.type || "");
    if (t === "ENTRADA") entriesMonth += Number(m.quantity || 0);
    else if (t === "SAIDA" || t === "PERDA") exitsMonth += Number(m.quantity || 0);
    else if (t === "TRANSFERENCIA") transfersMonth += Number(m.quantity || 0);
  }

  // Comentario: valor total estimado do estoque
  const priceMap = new Map<string, number>();
  for (const p of products) priceMap.set(String(p.id || ""), Number(p.unit_price || 0));
  let totalValue = 0;
  for (const s of stockRows) {
    const price = priceMap.get(String(s.product_id || "")) || 0;
    totalValue += Number(s.quantity || 0) * price;
  }

  return json({
    ok: true,
    summary: {
      total_products: totalProducts,
      total_stock: totalStock,
      low_stock_count: lowStockCount,
      entries_month: entriesMonth,
      exits_month: exitsMonth,
      transfers_month: transfersMonth,
      total_value: Math.round(totalValue * 100) / 100,
    },
  });
}

// ---------------------------------------------------------------------------
// HANDLER: create-movement — entrada, saida, ajuste ou perda
// ---------------------------------------------------------------------------
async function handleCreateMovement(session: SessionClaims, body: Record<string, unknown>): Promise<Response> {
  if (session.role !== "admin" && session.role !== "pastor" && session.role !== "secretario") {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const product_id = String(body.product_id || "").trim();
  const type = String(body.type || "").trim().toUpperCase();
  const quantity = Number(body.quantity) || 0;
  const unit_price = body.unit_price !== undefined ? Number(body.unit_price) : null;
  const church_totvs = String(body.church_totvs_id || session.active_totvs_id || "").trim();
  const notes = String(body.notes || "").trim() || null;

  if (!product_id) return json({ ok: false, error: "missing_product_id" }, 400);
  if (!["ENTRADA", "SAIDA", "AJUSTE", "PERDA"].includes(type)) return json({ ok: false, error: "invalid_type" }, 400);
  if (quantity <= 0) return json({ ok: false, error: "invalid_quantity" }, 400);
  if (!church_totvs) return json({ ok: false, error: "missing_church" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Comentario: busca o nome do responsavel
  const { data: userData } = await sb.from("users").select("full_name").eq("id", session.user_id).maybeSingle();
  const responsibleName = String((userData as Record<string, unknown> | null)?.full_name || "");

  // Comentario: busca saldo atual para validar saida
  const { data: currentStock } = await sb
    .from("deposit_stock")
    .select("id, quantity")
    .eq("product_id", product_id)
    .eq("church_totvs_id", church_totvs)
    .maybeSingle();

  const currentQty = Number((currentStock as Record<string, unknown> | null)?.quantity || 0);

  // Comentario: saida e perda nao podem exceder o estoque disponivel
  if ((type === "SAIDA" || type === "PERDA") && quantity > currentQty) {
    return json({ ok: false, error: "insufficient_stock", detail: `Estoque disponivel: ${currentQty}` }, 400);
  }

  // Comentario: calcula novo saldo
  let newQty = currentQty;
  if (type === "ENTRADA") newQty += quantity;
  else if (type === "SAIDA" || type === "PERDA") newQty -= quantity;
  else if (type === "AJUSTE") newQty = quantity; // ajuste seta o valor direto

  // Comentario: upsert do saldo no estoque
  if (currentStock) {
    await sb.from("deposit_stock").update({ quantity: newQty, updated_at: new Date().toISOString() }).eq("id", (currentStock as Record<string, unknown>).id);
  } else {
    await sb.from("deposit_stock").insert({ product_id, church_totvs_id: church_totvs, quantity: newQty });
  }

  // Comentario: registra a movimentacao no historico
  const { data: movement, error: mvErr } = await sb.from("deposit_movements").insert({
    product_id,
    type,
    quantity: type === "AJUSTE" ? quantity : quantity,
    unit_price,
    church_origin_totvs: type === "SAIDA" || type === "PERDA" ? church_totvs : null,
    church_destination_totvs: type === "ENTRADA" ? church_totvs : null,
    // Comentario: responsible_user_id pode ser null se o user_id nao for UUID valido
    responsible_user_id: session.user_id || null,
    responsible_name: responsibleName,
    notes,
  }).select().single();

  if (mvErr) return json({ ok: false, error: "db_error", details: mvErr.message }, 500);

  return json({ ok: true, movement, new_quantity: newQty });
}

// ---------------------------------------------------------------------------
// HANDLER: create-transfer — transferencia entre igrejas
// ---------------------------------------------------------------------------
async function handleCreateTransfer(session: SessionClaims, body: Record<string, unknown>): Promise<Response> {
  if (session.role !== "admin" && session.role !== "pastor") {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const product_id = String(body.product_id || "").trim();
  const quantity = Number(body.quantity) || 0;
  const origin_totvs = String(body.church_origin_totvs || "").trim();
  const destination_totvs = String(body.church_destination_totvs || "").trim();
  const notes = String(body.notes || "").trim() || null;

  if (!product_id) return json({ ok: false, error: "missing_product_id" }, 400);
  if (quantity <= 0) return json({ ok: false, error: "invalid_quantity" }, 400);
  if (!origin_totvs) return json({ ok: false, error: "missing_origin" }, 400);
  if (!destination_totvs) return json({ ok: false, error: "missing_destination" }, 400);
  if (origin_totvs === destination_totvs) return json({ ok: false, error: "same_church" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Comentario: verifica escopo — usuario deve ter acesso a igreja de origem
  const scope = await resolveScope(sb, session);
  if (!scope.has(origin_totvs)) return json({ ok: false, error: "forbidden_origin_out_of_scope" }, 403);

  // Comentario: busca nome do responsavel
  const { data: userData } = await sb.from("users").select("full_name").eq("id", session.user_id).maybeSingle();
  const responsibleName = String((userData as Record<string, unknown> | null)?.full_name || "");

  // Comentario: verifica estoque da origem
  const { data: originStock } = await sb
    .from("deposit_stock")
    .select("id, quantity")
    .eq("product_id", product_id)
    .eq("church_totvs_id", origin_totvs)
    .maybeSingle();

  const originQty = Number((originStock as Record<string, unknown> | null)?.quantity || 0);
  if (quantity > originQty) {
    return json({ ok: false, error: "insufficient_stock", detail: `Estoque disponivel na origem: ${originQty}` }, 400);
  }

  // Comentario: baixa do estoque da origem
  if (originStock) {
    await sb.from("deposit_stock")
      .update({ quantity: originQty - quantity, updated_at: new Date().toISOString() })
      .eq("id", (originStock as Record<string, unknown>).id);
  }

  // Comentario: adiciona ao estoque do destino (upsert)
  const { data: destStock } = await sb
    .from("deposit_stock")
    .select("id, quantity")
    .eq("product_id", product_id)
    .eq("church_totvs_id", destination_totvs)
    .maybeSingle();

  const destQty = Number((destStock as Record<string, unknown> | null)?.quantity || 0);
  if (destStock) {
    await sb.from("deposit_stock")
      .update({ quantity: destQty + quantity, updated_at: new Date().toISOString() })
      .eq("id", (destStock as Record<string, unknown>).id);
  } else {
    await sb.from("deposit_stock").insert({ product_id, church_totvs_id: destination_totvs, quantity });
  }

  // Comentario: registra no historico
  const { data: movement, error: mvErr } = await sb.from("deposit_movements").insert({
    product_id,
    type: "TRANSFERENCIA",
    quantity,
    church_origin_totvs: origin_totvs,
    church_destination_totvs: destination_totvs,
    responsible_user_id: session.user_id,
    responsible_name: responsibleName,
    notes,
  }).select().single();

  if (mvErr) return json({ ok: false, error: "db_error", details: mvErr.message }, 500);

  return json({ ok: true, movement, origin_new_qty: originQty - quantity, destination_new_qty: destQty + quantity });
}

// ---------------------------------------------------------------------------
// HANDLER: list-movements — historico de movimentacoes com filtros
// ---------------------------------------------------------------------------
async function handleListMovements(session: SessionClaims, body: Record<string, unknown>): Promise<Response> {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const scope = await resolveScope(sb, session);

  const page = Number(body.page) || 1;
  const page_size = Math.min(Number(body.page_size) || 50, 500);

  let q = sb.from("deposit_movements")
    .select("*, deposit_products(code, description, group_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * page_size, page * page_size - 1);

  // Comentario: filtros opcionais
  if (body.type) q = q.eq("type", String(body.type).toUpperCase());
  if (body.product_id) q = q.eq("product_id", String(body.product_id));
  if (body.date_start) q = q.gte("created_at", String(body.date_start));
  if (body.date_end) q = q.lte("created_at", String(body.date_end) + "T23:59:59Z");
  if (body.church_origin_totvs) q = q.eq("church_origin_totvs", String(body.church_origin_totvs));
  if (body.church_destination_totvs) q = q.eq("church_destination_totvs", String(body.church_destination_totvs));

  const { data, error, count } = await q;
  if (error) return json({ ok: false, error: "db_error", details: error.message }, 500);

  // Comentario: filtra apenas movimentacoes dentro do escopo do usuario
  const movements = (data || []).filter((m: Record<string, unknown>) => {
    const origin = String(m.church_origin_totvs || "");
    const dest = String(m.church_destination_totvs || "");
    return (origin && scope.has(origin)) || (dest && scope.has(dest)) || (!origin && !dest);
  });

  return json({ ok: true, movements, total: count || movements.length, page, page_size });
}

// ---------------------------------------------------------------------------
// ROTEADOR PRINCIPAL
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  // Comentario: preflight CORS
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "").trim().toLowerCase();

    // Comentario: todas as actions exigem autenticacao
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);

    switch (action) {
      case "list-products":
        return await handleListProducts(session, body);
      case "create-product":
        return await handleCreateProduct(session, body);
      case "update-product":
        return await handleUpdateProduct(session, body);
      case "list-stock":
        return await handleListStock(session, body);
      case "get-summary":
        return await handleGetSummary(session, body);
      case "create-movement":
        return await handleCreateMovement(session, body);
      case "create-transfer":
        return await handleCreateTransfer(session, body);
      case "list-movements":
        return await handleListMovements(session, body);
      default:
        return json({ ok: false, error: "unknown_action", detail: `Action '${action}' nao reconhecida.` }, 400);
    }
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
