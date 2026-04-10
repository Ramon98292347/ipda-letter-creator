/**
 * get-pastor-contact
 * ==================
 * O que faz: Retorna as informacoes de contato do pastor responsavel por uma igreja,
 *            buscando pelo totvs_id da igreja.
 * Para que serve: Usado no dashboard do obreiro, na pagina de documentos e no
 *                 formulario de carta para exibir dados do pastor responsavel.
 * Quem pode usar: admin, pastor, obreiro (qualquer role autenticado)
 * Recebe: { totvs_id: string }
 * Retorna: { ok, pastor: { full_name, phone, email, avatar_url, minister_role, signature_url } | null }
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
type Body = { totvs_id?: string };

async function verifySessionJWT(req: Request): Promise<{ user_id: string; role: Role } | null> {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const secret = Deno.env.get("USER_SESSION_JWT_SECRET") || "";
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(m[1].trim(), new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    const user_id = String(payload.sub || "");
    const role = String(payload.role || "").toLowerCase() as Role;
    if (!user_id || !["admin", "pastor", "obreiro", "secretario", "financeiro"].includes(role)) return null;
    return { user_id, role };
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    // Permite acesso não autenticado para formulários públicos como Caravanas,
    // mas a variavel session sera null.

    const body = (await req.json().catch(() => ({}))) as Body;
    const totvs = String(body.totvs_id || "").trim();
    if (!totvs) return json({ ok: false, error: "totvs_id_required" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Busca o pastor_user_id da igreja
    const { data: church } = await sb
      .from("churches")
      .select("pastor_user_id")
      .eq("totvs_id", totvs)
      .maybeSingle();

    if (!church?.pastor_user_id) {
      // Fallback: busca pelo default_totvs_id do usuario com role pastor
      const { data: byTotvs } = await sb
        .from("users")
        .select("full_name, phone, email, avatar_url, minister_role, signature_url")
        .eq("role", "pastor")
        .eq("default_totvs_id", totvs)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!byTotvs) return json({ ok: true, pastor: null });
      if (!session) {
        delete byTotvs.signature_url;
      }
      return json({ ok: true, pastor: byTotvs });
    }

    // Busca o pastor pelo ID
    const { data: pastor } = await sb
      .from("users")
      .select("full_name, phone, email, avatar_url, minister_role, signature_url")
      .eq("id", church.pastor_user_id)
      .eq("is_active", true)
      .maybeSingle();
    if (pastor && !session) {
      delete pastor.signature_url;
    }

    return json({ ok: true, pastor: pastor || null });
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
