/**
 * list-churches-in-scope
 * ======================
 * O que faz: Lista as igrejas visíveis ao usuário logado com paginação, trazendo dados do pastor
 *            de cada igreja (via join) e a contagem de obreiros ativos por igreja.
 * Para que serve: Usada na tela de gerenciamento de igrejas para o admin/pastor visualizar
 *                 e navegar pelas igrejas do seu escopo hierárquico.
 * Quem pode usar: admin, pastor
 * Recebe: { page?: number, page_size?: number, root_totvs_id?: string }
 * Retorna: { ok, churches, total, page, page_size }
 *          Cada chiesa inclui: dados básicos, pastor (id, full_name, phone, email, is_active),
 *          workers_count (número de obreiros ativos com default_totvs_id naquela igreja).
 * Observações: Admin pode filtrar por root_totvs_id para ver a sub-árvore de qualquer igreja.
 *              Pastor vê somente igrejas dentro da própria árvore hierárquica.
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
function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders() });
}

type Role = "admin" | "pastor" | "obreiro";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };
type Body = {
  page?: number;
  page_size?: number;
  root_totvs_id?: string;
};

async function verifySessionJWT(req: Request): Promise<SessionClaims | null> {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  const token = m[1].trim();
  const secret = Deno.env.get("USER_SESSION_JWT_SECRET") || "";
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
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

type ChurchRow = { totvs_id: string; parent_totvs_id: string | null; class?: string | null };

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

    const kids = children.get(cur) || [];
    for (const k of kids) queue.push(k);
  }

  return scope;
}

function isAncestorOf(descendantTotvs: string, possibleAncestorTotvs: string, churches: ChurchRow[]): boolean {
  if (!descendantTotvs || !possibleAncestorTotvs) return false;
  if (descendantTotvs === possibleAncestorTotvs) return true;
  const byId = new Map(churches.map((row) => [String(row.totvs_id), row]));
  const visited = new Set<string>();
  let current = String(descendantTotvs);
  while (current && !visited.has(current)) {
    visited.add(current);
    const row = byId.get(current);
    if (!row) return false;
    const parentId = row.parent_totvs_id ? String(row.parent_totvs_id) : "";
    if (!parentId) return false;
    if (parentId === possibleAncestorTotvs) return true;
    current = parentId;
  }
  return false;
}

// Comentario: determina o root do escopo de DESTINO para o obreiro.
// Regra: sobe para o pai da propria igreja. Se o pai for "central", sobe mais um nivel
// (setorial ou estadual) pois a central pertence ao escopo da setorial/estadual acima.
function findObreiroScopeRoot(activeTotvs: string, churches: ChurchRow[]): string {
  const byId = new Map<string, ChurchRow>();
  for (const c of churches) byId.set(String(c.totvs_id), c);

  const own = byId.get(activeTotvs);
  if (!own) return activeTotvs;

  const parentId = own.parent_totvs_id ? String(own.parent_totvs_id) : null;
  if (!parentId) return activeTotvs;

  const parent = byId.get(parentId);
  if (!parent) return parentId;

  const parentClass = String(parent.class || "").toLowerCase().trim();
  if (parentClass === "central") {
    const grandparentId = parent.parent_totvs_id ? String(parent.parent_totvs_id) : null;
    if (grandparentId) return grandparentId;
    return parentId;
  }

  return parentId;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);
    // Comentario: obreiro tambem pode chamar esta funcao para carregar destinos de carta.
    // Apenas "secretario" e "financeiro" sem restricao especial — todos os roles passam.
    const body = (await req.json().catch(() => ({}))) as Body;
    const page = Number.isFinite(body.page) ? Math.max(1, Number(body.page)) : 1;
    // Comentario: limite maximo reduzido de 5000 para 1000 para evitar sobrecarga de memoria e performance.
    const page_size = Number.isFinite(body.page_size) ? Math.max(1, Math.min(1000, Number(body.page_size))) : 20;
    const from = (page - 1) * page_size;
    const to = from + page_size - 1;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceRoleKey);

    // 1) Carrega todas as igrejas (para montar escopo)
    const { data: all, error: aErr } = await sb
      .from("churches")
      .select("totvs_id, parent_totvs_id, class");

    if (aErr) return json({ ok: false, error: "db_error_scope", details: aErr.message }, 500);

    const allRows = (all || []) as ChurchRow[];
    const requestedRoot = String(body.root_totvs_id || "").trim();

    let scopeList: string[] = [];
    // Comentario: effectiveRoot guarda o TOTVS raiz do escopo computado.
    // Usado para calcular ancestor_chain — os ancestrais acima do root
    // (ex.: estadual acima de setorial) retornados separadamente para o frontend
    // resolver a mae mais alta com pastor no campo "Outros".
    let effectiveRootForAncestors = "";
    // Comentario: declarado aqui para ser visivel em todos os branches do if/else abaixo.
    const ancestorIds: string[] = [];

    if (session.role === "admin") {
      // Comentario: admin enxerga todas as igrejas; root_totvs_id vira filtro opcional.
      if (requestedRoot) {
        const hasRoot = allRows.some((c) => String(c.totvs_id) === requestedRoot);
        if (!hasRoot) return json({ ok: false, error: "church_not_found" }, 404);
        effectiveRootForAncestors = requestedRoot;
        scopeList = [...computeScope(requestedRoot, allRows)];
      } else {
        scopeList = allRows.map((c) => String(c.totvs_id)).filter(Boolean);
      }
    } else if (session.role === "obreiro") {
      // Comentario: obreiro nao tem escopo proprio — sobe para a mae (ou avo se mae for "central")
      // usando findObreiroScopeRoot, igual ao telas-cartas. Nao pode usar requestedRoot.
      const obreiroScopeRoot = findObreiroScopeRoot(session.active_totvs_id, allRows);
      effectiveRootForAncestors = obreiroScopeRoot;
      scopeList = [...computeScope(obreiroScopeRoot, allRows)];
      // Comentario: ancestorIds sera preenchido pelo bloco compartilhado abaixo usando effectiveRootForAncestors.
    } else {
      // Comentario: pastor (e outros roles) sempre partem da igreja ativa da sessao.
      // Isso evita reduzir escopo quando o pastor e vinculado a outras igrejas
      // (pastor_user_id), o que antes podia trocar a raiz de forma inesperada.
      const scopeRootTotvs = session.active_totvs_id;
      const baseScope = computeScope(scopeRootTotvs, allRows);
      if (requestedRoot && !baseScope.has(requestedRoot)) {
        // Comentario: permite subir para mae/avo da igreja ativa.
        // Necessario para regional/local listar destinos no escopo superior.
        const isAncestorRoot = isAncestorOf(scopeRootTotvs, requestedRoot, allRows);
        if (!isAncestorRoot) {
          return json({ ok: false, error: "forbidden_church_out_of_scope" }, 403);
        }
      }
      const effectiveRoot = requestedRoot || scopeRootTotvs;
      effectiveRootForAncestors = effectiveRoot;
      scopeList = [...computeScope(effectiveRoot, allRows)];
    }

    // Comentario: coleta IDs dos ancestrais acima do effectiveRoot (ex.: estadual).
    // Usa allRows (todas as igrejas) para subir na hierarquia sem restricao de escopo.
    if (effectiveRootForAncestors) {
      const byId = new Map(allRows.map((r) => [String(r.totvs_id), r]));
      const visitedAnc = new Set<string>([effectiveRootForAncestors]);
      let curAnc = byId.get(effectiveRootForAncestors)?.parent_totvs_id
        ? String(byId.get(effectiveRootForAncestors)!.parent_totvs_id)
        : null;
      while (curAnc && !visitedAnc.has(curAnc)) {
        visitedAnc.add(curAnc);
        ancestorIds.push(curAnc);
        const row = byId.get(curAnc);
        curAnc = row?.parent_totvs_id ? String(row.parent_totvs_id) : null;
      }
    }

    const scopeTotal = scopeList.length;

    // 2) Busca igrejas do escopo + pastor (join)
    const { data: churches, error: cErr } = await sb
      .from("churches")
      .select(`
        totvs_id,
        parent_totvs_id,
        church_name,
        class,
        is_active,
        image_url,
        stamp_church_url,
        contact_email,
        contact_phone,
        cep,
        address_street,
        address_number,
        address_complement,
        address_neighborhood,
        address_city,
        address_state,
        address_country,
        pastor_user_id,
        pastor:pastor_user_id (
          id,
          full_name,
          phone,
          email,
          is_active
        )
      `)
      .in("totvs_id", scopeList)
      .order("church_name", { ascending: true })
      .range(from, to);

    if (cErr) return json({ ok: false, error: "db_error_list_churches", details: cErr.message }, 500);

    // 3) Conta obreiros por igreja (default_totvs_id)
    const churchIdsPage = (churches || []).map((ch: any) => String(ch.totvs_id || "")).filter(Boolean);
    let workers: Array<Record<string, unknown>> = [];
    if (churchIdsPage.length > 0) {
      const { data: workersData, error: wErr } = await sb
        .from("users")
        .select("id, default_totvs_id")
        .eq("role", "obreiro")
        .eq("is_active", true)
        .in("default_totvs_id", churchIdsPage);
      if (wErr) return json({ ok: false, error: "db_error_workers_count", details: wErr.message }, 500);
      workers = workersData || [];
    }

    const counts = new Map<string, number>();
    for (const w of workers || []) {
      const key = String((w as any).default_totvs_id || "");
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const enriched = (churches || []).map((ch: any) => ({
      ...ch,
      workers_count: counts.get(String(ch.totvs_id)) || 0,
    }));

    // Comentario: busca ancestrais acima do scope root com info do pastor.
    // Retornados em ancestor_chain — nao sao destinos, apenas para o frontend
    // resolver a mae mais alta com pastor (estadual > setorial > central).
    let ancestorChain: unknown[] = [];
    if (ancestorIds.length > 0) {
      const { data: ancData } = await sb
        .from("churches")
        .select(`
          totvs_id,
          parent_totvs_id,
          church_name,
          class,
          pastor:pastor_user_id (
            id,
            full_name,
            phone,
            email,
            is_active
          )
        `)
        .in("totvs_id", ancestorIds);
      ancestorChain = ancData || [];
    }

    return json({ ok: true, churches: enriched, ancestor_chain: ancestorChain, total: scopeTotal, page, page_size }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
