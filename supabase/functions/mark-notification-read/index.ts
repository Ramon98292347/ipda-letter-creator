/**
 * mark-notification-read
 * ======================
 * O que faz: Marca uma notificação específica como lida, atualizando is_read=true e
 *            read_at com o timestamp atual. Valida se o usuário tem permissão para
 *            marcar aquela notificação (própria, da igreja ativa, de filhas ou de ancestrais).
 * Para que serve: Acionado quando o usuário clica em uma notificação no sininho para marcá-la como lida.
 * Quem pode usar: admin, pastor, obreiro
 * Recebe: { id: string } (ID da notificação)
 * Retorna: { ok, notification }
 * Observações: Atualiza tanto is_read quanto read_at para manter compatibilidade.
 *              Pastor/admin podem marcar notificações da própria igreja, das filhas (escopo)
 *              e também das igrejas mãe/avó (ancestrais).
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

type Role = "admin" | "pastor" | "obreiro";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };
type Body = { id?: string };
type ChurchRow = { totvs_id: string; parent_totvs_id: string | null };

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

function collectAncestors(startTotvs: string, churches: ChurchRow[]): Set<string> {
  const byId = new Map<string, string | null>();
  for (const c of churches) byId.set(String(c.totvs_id), c.parent_totvs_id ? String(c.parent_totvs_id) : null);

  const out = new Set<string>();
  let cur = startTotvs;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const parent = byId.get(cur) || null;
    if (!parent) break;
    out.add(parent);
    cur = parent;
  }
  return out;
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

    const body = (await req.json().catch(() => ({}))) as Body;
    const id = String(body.id || "").trim();
    if (!id) return json({ ok: false, error: "missing_id" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data: row, error: findErr } = await sb
      .from("notifications")
      .select("id, church_totvs_id, user_id, read_at")
      .eq("id", id)
      .maybeSingle();

    if (findErr) return json({ ok: false, error: "db_error_find", details: "erro interno" }, 500);
    if (!row) return json({ ok: false, error: "notification_not_found" }, 404);

    const isMine = String(row.user_id || "") === session.user_id;
    let isChurchAllowed = String(row.church_totvs_id || "") === session.active_totvs_id;

    // Comentario: pastor/admin podem marcar notificacoes da igreja ativa,
    // das filhas (escopo) e tambem da cadeia acima (mae/avo).
    if (!isChurchAllowed && (session.role === "pastor" || session.role === "admin")) {
      const { data: allChurches, error: cErr } = await sb
        .from("churches")
        .select("totvs_id,parent_totvs_id");

      if (cErr) return json({ ok: false, error: "db_error_scope", details: "erro interno" }, 500);

      const rows = (allChurches || []) as ChurchRow[];
      const scope = computeScope(session.active_totvs_id, rows);
      const ancestors = collectAncestors(session.active_totvs_id, rows);
      const notifTotvs = String(row.church_totvs_id || "");
      isChurchAllowed = scope.has(notifTotvs) || ancestors.has(notifTotvs);
    }

    if (!isMine && !isChurchAllowed) return json({ ok: false, error: "forbidden" }, 403);

    const { data: updated, error: updErr } = await sb
      .from("notifications")
      // Comentario: atualiza os dois campos para manter compatibilidade
      // com telas/queries que usam is_read ou read_at.
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (updErr) return json({ ok: false, error: "db_error_update", details: "erro interno" }, 500);
    return json({ ok: true, notification: updated }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
