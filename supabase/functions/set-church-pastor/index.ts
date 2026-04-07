/**
 * set-church-pastor
 * =================
 * O que faz: Atribui um pastor a uma igreja. Atualiza o papel do novo pastor para "pastor"
 *            no campo totvs_access com acesso à igreja informada. O pastor anterior (se existir)
 *            tem seu papel rebaixado para "obreiro" naquela igreja, ou mantido como "pastor"
 *            se ainda tiver acesso de pastor em outra igreja.
 * Para que serve: Usada pelo admin/pastor para designar ou trocar o pastor responsável de uma igreja.
 * Quem pode usar: admin, pastor (somente igrejas dentro do próprio escopo e de nível inferior)
 * Recebe: { church_totvs_id: string, pastor_user_id: string }
 * Retorna: { ok, church }
 * Observações: Pastor não pode promover outro pastor a um nível hierárquico igual ou acima
 *              do seu próprio. Ao ser designado, a default_totvs_id do novo pastor é atualizada
 *              para a igreja atribuída.
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}

type Role = "admin" | "pastor" | "obreiro";
type ChurchClass = "estadual" | "setorial" | "central" | "regional" | "local" | "casa_oracao";

type SessionClaims = {
  user_id: string;
  role: Role;
  active_totvs_id: string;
};

type ChurchRow = {
  totvs_id: string;
  class: string | null;
  parent_totvs_id: string | null;
  pastor_user_id: string | null;
};

type TotvsAccessItem = {
  totvs_id: string;
  role: Role;
};

type Body = {
  church_totvs_id?: string;
  pastor_user_id?: string;
};

function normalizeChurchClass(value: string | null | undefined): ChurchClass | null {
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
  for (const c of churches) {
    const parent = String(c.parent_totvs_id || "");
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(String(c.totvs_id));
  }

  const scope = new Set<string>();
  const queue: string[] = [rootTotvs];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (scope.has(current)) continue;
    scope.add(current);
    for (const child of children.get(current) || []) queue.push(child);
  }

  return scope;
}

function normalizeTotvsAccess(items: unknown): TotvsAccessItem[] {
  if (!Array.isArray(items)) return [];
  const out: TotvsAccessItem[] = [];

  for (const raw of items) {
    if (typeof raw === "string") {
      const id = raw.trim();
      if (id) out.push({ totvs_id: id, role: "obreiro" });
      continue;
    }

    if (!raw || typeof raw !== "object") continue;
    const id = String((raw as Record<string, unknown>).totvs_id || "").trim();
    const roleRaw = String((raw as Record<string, unknown>).role || "obreiro").toLowerCase();
    const role: Role = roleRaw === "admin" || roleRaw === "pastor" || roleRaw === "obreiro" ? roleRaw : "obreiro";
    if (id) out.push({ totvs_id: id, role });
  }

  const uniq = new Map<string, TotvsAccessItem>();
  for (const item of out) uniq.set(item.totvs_id, item);
  return [...uniq.values()];
}

function upsertChurchAccess(items: TotvsAccessItem[], churchTotvs: string, role: Role): TotvsAccessItem[] {
  const map = new Map<string, TotvsAccessItem>(items.map((i) => [i.totvs_id, i]));
  map.set(churchTotvs, { totvs_id: churchTotvs, role });
  return [...map.values()];
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);
    if (session.role === "obreiro") return json({ ok: false, error: "forbidden" }, 403);

    const body = (await req.json().catch(() => ({}))) as Body;
    const church_totvs_id = String(body.church_totvs_id || "").trim();
    const pastor_user_id = String(body.pastor_user_id || "").trim();

    if (!church_totvs_id) return json({ ok: false, error: "missing_church_totvs_id" }, 400);
    if (!pastor_user_id) return json({ ok: false, error: "missing_pastor_user_id" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

    const { data: churches, error: churchesErr } = await sb
      .from("churches")
      .select("totvs_id, class, parent_totvs_id, pastor_user_id");
    if (churchesErr) return json({ ok: false, error: "db_error_churches", details: churchesErr.message }, 500);

    const rows = (churches || []) as ChurchRow[];
    const byTotvs = new Map<string, ChurchRow>(rows.map((r) => [String(r.totvs_id), r]));
    const church = byTotvs.get(church_totvs_id);
    if (!church) return json({ ok: false, error: "church_not_found" }, 404);

    // Comentario: pastor so pode operar dentro da propria arvore de igrejas.
    if (session.role === "pastor") {
      const scope = computeScope(session.active_totvs_id, rows);
      if (!scope.has(church_totvs_id)) {
        return json({ ok: false, error: "church_out_of_scope" }, 403);
      }

      // Comentario: pastor nao pode promover acima do proprio nivel.
      const activeClass = normalizeChurchClass(byTotvs.get(session.active_totvs_id)?.class);
      const targetClass = normalizeChurchClass(church.class);
      if (!activeClass || !targetClass) return json({ ok: false, error: "invalid_church_class" }, 400);
      const allowedChildren: Record<ChurchClass, ChurchClass[]> = {
        estadual: ["setorial", "central", "regional", "local", "casa_oracao"],
        setorial: ["central", "regional", "local", "casa_oracao"],
        central: ["regional", "local", "casa_oracao"],
        regional: ["local", "casa_oracao"],
        local: ["casa_oracao"],
        casa_oracao: [],
      };
      if (targetClass !== activeClass && !allowedChildren[activeClass].includes(targetClass)) {
        return json({ ok: false, error: "forbidden_level_promotion" }, 403);
      }
    }

    const { data: newPastor, error: newPastorErr } = await sb
      .from("users")
      .select("id, full_name, role, is_active, totvs_access, default_totvs_id")
      .eq("id", pastor_user_id)
      .maybeSingle();
    if (newPastorErr) return json({ ok: false, error: "db_error_new_pastor", details: newPastorErr.message }, 500);
    if (!newPastor) return json({ ok: false, error: "pastor_user_not_found" }, 404);
    if (newPastor.is_active === false) return json({ ok: false, error: "pastor_user_inactive" }, 409);

    // Comentario: verifica se este usuario ja e pastor de outra church
    // Regra: um pastor so pode ser atribuido a uma unica church
    const { data: alreadyPastor } = await sb
      .from("churches")
      .select("totvs_id, nome")
      .eq("pastor_user_id", pastor_user_id)
      .neq("totvs_id", church_totvs_id)
      .maybeSingle();

    if (alreadyPastor) {
      return json({
        ok: false,
        error: "pastor_already_assigned",
        detail: `Este usuario ja e pastor da igreja ${String(alreadyPastor.totvs_id || "")}. Um pastor so pode ser atribuido a uma unica church.`,
      }, 409);
    }

    const newAccess = normalizeTotvsAccess(newPastor.totvs_access);
    const newAccessUpdated = upsertChurchAccess(newAccess, church_totvs_id, "pastor");
    // Comentario: ao cadastrar/trocar pastor, a igreja padrao do usuario passa a ser a igreja atribuida.
    const newDefaultTotvs = church_totvs_id;

    const { error: updateNewErr } = await sb
      .from("users")
      .update({
        role: "pastor",
        totvs_access: newAccessUpdated,
        default_totvs_id: newDefaultTotvs,
      })
      .eq("id", pastor_user_id);
    if (updateNewErr) return json({ ok: false, error: "db_error_update_new_pastor", details: updateNewErr.message }, 500);

    const previousPastorId = String(church.pastor_user_id || "").trim();
    if (previousPastorId && previousPastorId !== pastor_user_id) {
      const { data: oldPastor, error: oldPastorErr } = await sb
        .from("users")
        .select("id, role, totvs_access")
        .eq("id", previousPastorId)
        .maybeSingle();
      if (oldPastorErr) return json({ ok: false, error: "db_error_old_pastor", details: oldPastorErr.message }, 500);

      if (oldPastor) {
        const oldAccess = normalizeTotvsAccess(oldPastor.totvs_access).map((item) =>
          item.totvs_id === church_totvs_id ? { ...item, role: "obreiro" as Role } : item,
        );
        const stillPastorSomewhere = oldAccess.some((item) => item.role === "pastor");
        const oldGlobalRole: Role = stillPastorSomewhere ? "pastor" : "obreiro";

        const { error: downgradeErr } = await sb
          .from("users")
          .update({
            role: oldGlobalRole,
            totvs_access: oldAccess,
          })
          .eq("id", previousPastorId);
        if (downgradeErr) return json({ ok: false, error: "db_error_downgrade_old_pastor", details: downgradeErr.message }, 500);
      }
    }

    const { data: savedChurch, error: churchUpdateErr } = await sb
      .from("churches")
      .update({ pastor_user_id })
      .eq("totvs_id", church_totvs_id)
      .select("totvs_id, pastor_user_id")
      .single();
    if (churchUpdateErr) return json({ ok: false, error: "db_error_update_church", details: churchUpdateErr.message }, 500);

    return json(
      {
        ok: true,
        church: savedChurch,
      },
      200,
    );
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
