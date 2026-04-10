/**
 * get-letter-pdf-url
 * ==================
 * O que faz: Retorna a URL assinada (ou pública) do PDF de uma carta de pregação,
 *            tentando múltiplos caminhos possíveis no Storage do Supabase (bucket "cartas").
 *            Prioriza url_carta > signed_url > public_url como fallback.
 * Para que serve: Usada pelo front-end quando o usuário clica para visualizar/baixar
 *                 o PDF de uma carta de pregação já gerada.
 * Quem pode usar: admin, pastor, obreiro (obreiro somente para suas próprias cartas)
 * Recebe: { letter_id: string }
 * Retorna: { ok, url, source, path? }
 * Observações: A URL assinada tem validade de 30 minutos.
 *              Se storage_path não estiver salvo mas url_pronta=true, tenta caminho padrão por ID.
 *              Obreiro só pode acessar cartas onde ele é o pregador (preacher_user_id).
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
type Body = { letter_id?: string };
type ChurchRow = { totvs_id: string; parent_totvs_id: string | null };

async function verifySessionJWT(req: Request): Promise<SessionClaims | null> {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  const token = m[1].trim();
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

function normalizeStoragePath(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw || raw === "true" || raw === "false" || raw === "null" || raw === "undefined") return "";
  const noSlash = raw.replace(/^\/+/, "");
  // Comentario: em alguns registros veio com prefixo do bucket.
  return noSlash.replace(/^cartas\//i, "").replace(/^public\/cartas\//i, "");
}

function buildPathCandidates(path: string): string[] {
  const base = path.trim().replace(/^\/+/, "");
  if (!base) return [];
  const out = new Set<string>([base]);
  if (base.startsWith("cartas/")) out.add(base.replace(/^cartas\//, ""));
  else out.add(`cartas/${base}`);
  return [...out];
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const session = await verifySessionJWT(req);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;
    const letter_id = String(body.letter_id || "").trim();
    if (!letter_id) return json({ ok: false, error: "missing_letter_id" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let letterQuery = await sb
      .from("letters")
      .select("id, church_totvs_id, preacher_user_id, status, storage_path, url_pronta, url_carta")
      .eq("id", letter_id)
      .maybeSingle();

    if (letterQuery.error && String(letterQuery.error.message || "").toLowerCase().includes("url_carta")) {
      letterQuery = await sb
        .from("letters")
        .select("id, church_totvs_id, preacher_user_id, status, storage_path, url_pronta")
        .eq("id", letter_id)
        .maybeSingle();
    }

    const { data: letter, error: lErr } = letterQuery;
    if (lErr) return json({ ok: false, error: "db_error_letter", details: "erro interno" }, 500);
    if (!letter) return json({ ok: false, error: "letter_not_found" }, 404);

    const letterChurch = String((letter as Record<string, unknown>).church_totvs_id || "");
    const preacherUserId = String((letter as Record<string, unknown>).preacher_user_id || "");

    if (session.role === "obreiro") {
      if (!preacherUserId || preacherUserId !== session.user_id) {
        return json({ ok: false, error: "forbidden" }, 403);
      }
    } else {
      const { data: allChurches, error: cErr } = await sb.from("churches").select("totvs_id,parent_totvs_id");
      if (cErr) return json({ ok: false, error: "db_error_scope", details: "erro interno" }, 500);
      const scope = computeScope(session.active_totvs_id, (allChurches || []) as ChurchRow[]);
      if (!scope.has(letterChurch) && session.role !== "admin") {
        return json({ ok: false, error: "forbidden" }, 403);
      }
    }

    // Prioriza url_carta quando existir.
    const urlCarta = String((letter as Record<string, unknown>).url_carta || "").trim();
    if (urlCarta.startsWith("http://") || urlCarta.startsWith("https://")) {
      return json({ ok: true, url: urlCarta, source: "url_carta" }, 200);
    }

    const storagePath = normalizeStoragePath((letter as Record<string, unknown>).storage_path);
    const isUrlPronta = Boolean((letter as Record<string, unknown>).url_pronta);
    if (!storagePath) {
      // Comentario: compatibilidade com registros antigos onde o path nao foi salvo.
      // Quando url_pronta=true, tenta caminho padrao por id.
      if (isUrlPronta) {
        const fallbackPath = `documentos/cartas/${letter_id}.pdf`;
        const { data: signedFallback, error: fallbackErr } = await sb.storage
          .from("cartas")
          .createSignedUrl(fallbackPath, 60 * 30);
        if (!fallbackErr && signedFallback?.signedUrl) {
          return json({ ok: true, url: signedFallback.signedUrl, source: "fallback_by_id", path: fallbackPath }, 200);
        }
      }
      return json({ ok: false, error: "pdf_not_ready" }, 409);
    }

    if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
      return json({ ok: true, url: storagePath, source: "storage_path_url" }, 200);
    }

    const pathCandidates = buildPathCandidates(storagePath);
    let lastErr = "";
    for (const candidate of pathCandidates) {
      const { data: signed, error: signErr } = await sb.storage
        .from("cartas")
        .createSignedUrl(candidate, 60 * 30);
      if (!signErr && signed?.signedUrl) {
        return json({ ok: true, url: signed.signedUrl, source: "signed_url", path: candidate }, 200);
      }
      lastErr = String(signErr?.message || "");
    }

    // Fallback publico (quando bucket/objeto esta publico e assinatura falha).
    const publicPath = pathCandidates[0] || storagePath;
    const { data: pub } = sb.storage.from("cartas").getPublicUrl(publicPath);
    if (pub?.publicUrl) {
      return json({ ok: true, url: pub.publicUrl, source: "public_url_fallback", path: publicPath }, 200);
    }

    return json({ ok: false, error: "signed_url_failed", details: lastErr || "no_valid_storage_path", path: storagePath }, 500);
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
