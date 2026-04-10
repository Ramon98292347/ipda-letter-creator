/**
 * list-notifications
 * ==================
 * O que faz: Lista as notificações do usuário logado, unindo notificações da igreja ativa
 *            (church_totvs_id) com as notificações individuais (user_id), removendo duplicatas.
 *            Suporta paginação e filtro de não lidas.
 * Para que serve: Alimenta o sininho de notificações no front-end (badge de não lidas + lista).
 * Quem pode usar: admin, pastor, obreiro
 * Recebe: { page?, page_size?, unread_only?, church_totvs_id? }
 * Retorna: { ok, notifications, total, unread_count, page, page_size }
 * Observações: Notificações de aniversário (birthday), cartas criadas/liberadas e documentos
 *              prontos são os tipos principais. O campo unread_count considera tanto is_read
 *              quanto read_at para compatibilidade com registros antigos.
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

type Role = "admin" | "pastor" | "obreiro" | "secretario" | "financeiro";
type SessionClaims = { user_id: string; role: Role; active_totvs_id: string };
type Body = {
  page?: number;
  page_size?: number;
  unread_only?: boolean;
  church_totvs_id?: string;
};

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
    const page = Number.isFinite(body.page) ? Math.max(1, Number(body.page)) : 1;
    const page_size = Number.isFinite(body.page_size) ? Math.max(1, Math.min(100, Number(body.page_size))) : 20;
    const unreadOnly = Boolean(body.unread_only);
    const churchTotvs = String(body.church_totvs_id || "").trim() || session.active_totvs_id;

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    // Comentario: financeiro so ve notificacoes do tipo "financial" —
    // nao precisa ver aniversarios, cartas ou documentos de outros roles.
    // Pastor ve todos os tipos, incluindo financeiro.
    const isFinanceiro = session.role === "financeiro";

    let qChurch = sb
      .from("notifications")
      .select("*")
      .eq("church_totvs_id", churchTotvs)
      .order("created_at", { ascending: false });

    let qMine = sb
      .from("notifications")
      .select("*")
      .eq("user_id", session.user_id)
      .order("created_at", { ascending: false });

    if (isFinanceiro) {
      // Financeiro só vê notificações financeiras
      qChurch = qChurch.eq("type", "financial");
      qMine = qMine.eq("type", "financial");
    }

    if (unreadOnly) {
      // Comentario: considera nao lida por qualquer um dos dois campos.
      qChurch = qChurch.or("is_read.eq.false,read_at.is.null");
      qMine = qMine.or("is_read.eq.false,read_at.is.null");
    }

    const [{ data: churchRows, error: churchErr }, { data: myRows, error: myErr }] = await Promise.all([
      qChurch,
      qMine,
    ]);

    if (churchErr) return json({ ok: false, error: "db_error_list_church", details: "erro interno" }, 500);
    if (myErr) return json({ ok: false, error: "db_error_list_user", details: "erro interno" }, 500);

    // Comentario: junta notificacoes da igreja + individuais e remove duplicadas por id.
    const merged = [...(churchRows || []), ...(myRows || [])];
    const uniq = new Map<string, Record<string, unknown>>();
    for (const item of merged) uniq.set(String(item.id), item);
    const sorted = [...uniq.values()].sort((a, b) => {
      const da = String(a.created_at || "");
      const db = String(b.created_at || "");
      return db.localeCompare(da);
    });

    const total = sorted.length;
    const from = (page - 1) * page_size;
    const to = from + page_size;
    const notifications = sorted.slice(from, to);
    const unread_count = sorted.filter((n) => {
      const isRead = Boolean(n.is_read);
      const readAt = String(n.read_at || "");
      return !isRead || !readAt;
    }).length;

    return json({ ok: true, notifications, total, unread_count, page, page_size }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
