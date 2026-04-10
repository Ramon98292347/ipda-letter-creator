/**
 * list-orders
 * ===========
 * Objetivo: listar pedidos para o admin/pastor/secretário.
 * Como funciona:
 * - valida JWT custom (USER_SESSION_JWT_SECRET)
 * - admin vê todos; pastor/secretário vê apenas a igreja ativa
 * - agrega itens do pedido em `items`
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

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

type Role = "admin" | "pastor" | "secretario";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };
type Body = { limit?: number };

type TotvsAccessItem = string | { totvs_id?: string; role?: string };

function normalizeTotvsAccess(arr: unknown): string[] {
  const out: string[] = [];
  if (!Array.isArray(arr)) return out;
  for (const item of arr as TotvsAccessItem[]) {
    if (typeof item === "string") {
      const t = item.trim();
      if (t) out.push(t);
      continue;
    }
    if (item && typeof item === "object") {
      const t = String(item.totvs_id || "").trim();
      if (t) out.push(t);
    }
  }
  return Array.from(new Set(out));
}

async function verifySessionJWT(req: Request): Promise<SessionClaims | null> {
  // Extrai token Bearer e valida com o segredo custom
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const secret = Deno.env.get("USER_SESSION_JWT_SECRET") || "";
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(m[1].trim(), new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    const user_id = String(payload.sub || "");
    const role = String(payload.role || "").toLowerCase() as Role;
    const active_totvs_id = String(payload.active_totvs_id || "");
    if (!user_id || !active_totvs_id) return null;
    if (!["admin", "pastor", "secretario"].includes(role)) return null;
    return { user_id, role, active_totvs_id };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  // Autenticação obrigatória
  const session = await verifySessionJWT(req);
  if (!session) return json({ ok: false, error: "unauthorized" }, 401);

  try {
    // 1) Paginação simples por limite
    const body = (await req.json().catch(() => ({}))) as Body;
    const limit = Math.max(1, Math.min(500, Number(body.limit || 200)));

    // 2) Busca pedidos
    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    let query = sb
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    // Pastor/secretário veem apenas igrejas permitidas
    if (session.role !== "admin") {
      const { data: userRow, error: uErr } = await sb
        .from("users")
        .select("totvs_access, default_totvs_id")
        .eq("id", session.user_id)
        .maybeSingle();
      if (uErr) return json({ ok: false, error: "db_error_user_access", details: "erro interno" }, 500);

      const allowed = normalizeTotvsAccess(userRow?.totvs_access);
      const fallback = String(userRow?.default_totvs_id || session.active_totvs_id || "").trim();
      const finalIds = allowed.length > 0 ? allowed : (fallback ? [fallback] : []);

      if (finalIds.length === 0) return json({ ok: true, orders: [] });
      const list = finalIds.map((id) => `"${id}"`).join(",");
      query = query.or(`church_totvs_id.in.(${list}),estadual_totvs_id.in.(${list})`);
    }

    const { data: orders, error } = await query;
    if (error) return json({ ok: false, error: "db_error_list_orders", details: "erro interno" }, 500);

    // 3) Busca itens em lote
    const ids = (orders || []).map((o: Record<string, unknown>) => String(o.id || "")).filter(Boolean);
    if (ids.length === 0) return json({ ok: true, orders: [] });

    const { data: items, error: iErr } = await sb
      .from("order_items")
      .select("*")
      .in("order_id", ids);
    if (iErr) return json({ ok: false, error: "db_error_list_items", details: "erro interno" }, 500);

    // 4) Junta itens no pedido
    const itemsByOrder = new Map<string, Record<string, unknown>[]>();
    for (const it of items || []) {
      const order_id = String((it as Record<string, unknown>).order_id || "");
      if (!itemsByOrder.has(order_id)) itemsByOrder.set(order_id, []);
      itemsByOrder.get(order_id)!.push(it as Record<string, unknown>);
    }

    const merged = (orders || []).map((o: Record<string, unknown>) => ({
      ...o,
      items: itemsByOrder.get(String(o.id || "")) || [],
    }));

    return json({ ok: true, orders: merged });
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
