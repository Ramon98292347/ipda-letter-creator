/**
 * create-church
 * =============
 * O que faz: Cria ou atualiza (upsert) uma igreja no sistema, validando a hierarquia
 *            entre classes (estadual > setorial > central > regional > local) e o escopo do usuário.
 * Para que serve: Usada pelo admin ou pastor para cadastrar novas igrejas ou editar dados de igrejas existentes.
 * Quem pode usar: admin, pastor (somente igrejas dentro do próprio escopo/arvore)
 * Recebe: { totvs_id, church_name, class, parent_totvs_id, image_url, stamp_church_url,
 *           contact_email, contact_phone, cep, address_street, address_number,
 *           address_complement, address_neighborhood, address_city, address_state,
 *           address_country, is_active }
 * Retorna: { ok, mode: "created"|"updated", church }
 * Observações: Pastor não pode criar igrejas de nível igual ou acima do seu e só pode
 *              cadastrar como filha da própria igreja ativa.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

// ---------------- CORS ----------------
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
type ChurchClass = "estadual" | "setorial" | "central" | "regional" | "local" | "casa_oracao";

type SessionClaims = {
  user_id: string;
  role: Role;
  active_totvs_id: string;
};

type Body = {
  totvs_id?: string;
  church_name?: string;
  class?: ChurchClass;
  parent_totvs_id?: string | null;
  image_url?: string | null;
  stamp_church_url?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  cep?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_country?: string | null;
  is_active?: boolean | null;
};

type ChurchRow = {
  totvs_id: string;
  church_name: string;
  class: string | null;
  parent_totvs_id: string | null;
  is_active: boolean | null;
};

const childClassMap: Record<ChurchClass, ChurchClass[]> = {
  estadual: ["setorial", "central", "regional", "local", "casa_oracao"],
  setorial: ["central", "regional", "local", "casa_oracao"],
  central: ["regional", "local", "casa_oracao"],
  regional: ["local", "casa_oracao"],
  local: ["casa_oracao"],
  casa_oracao: [],
};

function normalizeClass(value: string | null | undefined): ChurchClass | null {
  const safe = String(value || "").trim().toLowerCase();
  if (
    safe === "estadual" ||
    safe === "setorial" ||
    safe === "central" ||
    safe === "regional" ||
    safe === "local" ||
    safe === "casa_oracao"
  ) {
    return safe;
  }
  return null;
}

function computeScope(rootTotvs: string, churches: ChurchRow[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const row of churches) {
    const parent = String(row.parent_totvs_id || "");
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(String(row.totvs_id));
  }

  const scope = new Set<string>();
  const queue = [String(rootTotvs)];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (scope.has(current)) continue;
    scope.add(current);
    for (const child of children.get(current) || []) queue.push(child);
  }

  return scope;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);
    if (session.role === "obreiro") return json({ ok: false, error: "forbidden" }, 403);

    const body = (await req.json().catch(() => ({}))) as Body;
    const totvs_id = String(body.totvs_id || "").trim();
    const church_name = String(body.church_name || "").trim();
    const church_class = normalizeClass(body.class);
    const parent_totvs_id = String(body.parent_totvs_id || "").trim() || null;
    const image_url = String(body.image_url || "").trim() || null;
    const stamp_church_url = String(body.stamp_church_url || "").trim() || null;
    const contact_email = String(body.contact_email || "").trim() || null;
    const contact_phone = String(body.contact_phone || "").trim() || null;
    const cep = String(body.cep || "").replace(/\D/g, "").slice(0, 8) || null;
    const address_street = String(body.address_street || "").trim() || null;
    const address_number = String(body.address_number || "").trim() || null;
    const address_complement = String(body.address_complement || "").trim() || null;
    const address_neighborhood = String(body.address_neighborhood || "").trim() || null;
    const address_city = String(body.address_city || "").trim() || null;
    const address_state = String(body.address_state || "").trim().toUpperCase().slice(0, 2) || null;
    const address_country = String(body.address_country || "BR").trim().toUpperCase().slice(0, 2) || "BR";
    const is_active = typeof body.is_active === "boolean" ? body.is_active : true;

    if (!totvs_id) return json({ ok: false, error: "missing_totvs_id" }, 400);
    if (!church_name) return json({ ok: false, error: "missing_church_name" }, 400);
    if (!church_class) return json({ ok: false, error: "invalid_class" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    // Comentário: busca todas as igrejas para validar hierarquia/escopo.
    const { data: allRows, error: allErr } = await sb
      .from("churches")
      .select("totvs_id, church_name, class, parent_totvs_id, is_active");

    if (allErr) return json({ ok: false, error: "db_error_list_churches", details: allErr.message }, 500);

    const churches = (allRows || []) as ChurchRow[];
    const byTotvs = new Map<string, ChurchRow>(churches.map((row) => [String(row.totvs_id), row]));
    const existing = byTotvs.get(totvs_id) || null;

    // Comentário: regra global de hierarquia por pai.
    if (church_class === "estadual") {
      if (parent_totvs_id) return json({ ok: false, error: "estadual_cannot_have_parent" }, 400);
    } else {
      if (!parent_totvs_id) return json({ ok: false, error: "missing_parent_totvs_id" }, 400);
      const parent = byTotvs.get(parent_totvs_id);
      if (!parent) return json({ ok: false, error: "parent_not_found" }, 404);
      const parentClass = normalizeClass(parent.class);
      if (!parentClass) return json({ ok: false, error: "parent_invalid_class" }, 400);
      const allowedChildren = childClassMap[parentClass];
      if (!allowedChildren.includes(church_class)) {
        return json(
          {
            ok: false,
            error: "invalid_child_class_for_parent",
            detail: `Igreja ${parentClass} nao pode cadastrar igreja ${church_class}.`,
            parent_class: parentClass,
            child_class: church_class,
          },
          403,
        );
      }
    }

    // Comentário: pastor só pode operar no próprio escopo "para baixo".
    if (session.role === "pastor") {
      if (church_class === "estadual" && !existing) {
        return json({ ok: false, error: "pastor_cannot_create_estadual" }, 403);
      }

      const activeChurch = byTotvs.get(session.active_totvs_id);
      if (!activeChurch) return json({ ok: false, error: "active_church_not_found" }, 403);

      const activeClass = normalizeClass(activeChurch.class);
      if (!activeClass) return json({ ok: false, error: "active_church_invalid_class" }, 403);

      const allowedChildrenFromActive = childClassMap[activeClass];
      if (allowedChildrenFromActive.length === 0) {
        return json({ ok: false, error: "pastor_level_cannot_create_children" }, 403);
      }

      const scope = computeScope(session.active_totvs_id, churches);
      if (parent_totvs_id) {
        if (!scope.has(parent_totvs_id)) {
          return json(
            {
              ok: false,
              error: "parent_out_of_scope",
              detail: "A igreja mae precisa estar no escopo da igreja logada.",
            },
            403,
          );
        }
      }

      // Coment?rio: ao criar, o pai precisa ser a igreja do login.
      if (!existing && parent_totvs_id && parent_totvs_id !== session.active_totvs_id) {
        return json(
          {
            ok: false,
            error: "parent_must_match_active_church",
            detail: "Para novo cadastro, a igreja mae precisa ser a igreja do login atual.",
          },
          403,
        );
      }

      // Coment?rio: para edi??o, o alvo tamb?m precisa estar no escopo.
      if (existing && !scope.has(existing.totvs_id)) {
        return json({ ok: false, error: "church_out_of_scope" }, 403);
      }
    }

    const payload = {
      totvs_id,
      church_name,
      class: church_class,
      parent_totvs_id,
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
      is_active,
    };

    const { data: saved, error: saveErr } = await sb
      .from("churches")
      .upsert(payload, { onConflict: "totvs_id" })
      .select(
        "totvs_id, church_name, class, parent_totvs_id, image_url, contact_email, contact_phone, cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_country, is_active",
      )
      .single();

    if (saveErr) return json({ ok: false, error: "db_error_save_church", details: saveErr.message }, 500);

    return json(
      {
        ok: true,
        mode: existing ? "updated" : "created",
        church: saved,
      },
      200,
    );
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
