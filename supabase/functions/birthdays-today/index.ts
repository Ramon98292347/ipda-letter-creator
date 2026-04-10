/**
 * birthdays-today
 * ===============
 * Lista aniversariantes do dia da igreja ativa.
 * Aceita 2 modos:
 * 1) Com JWT de sessao (usa active_totvs_id do token)
 * 2) Publico via CPF (usa default_totvs_id do usuario dono do CPF)
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

function monthDay(dateStr: string): string | null {
  const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[2]}-${m[3]}`;
}

function todayMonthDaySaoPaulo(): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const mm = parts.find((p) => p.type === "month")?.value || "01";
  const dd = parts.find((p) => p.type === "day")?.value || "01";
  return `${mm}-${dd}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as { limit?: number; cpf?: string };
    const session = await verifySessionJWT(req);
    const limit = Number.isFinite(body.limit) ? Math.max(1, Math.min(30, Number(body.limit))) : 10;
    const cpf = String(body.cpf || "").replace(/\D/g, "");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    let activeTotvsId = "";
    if (session?.active_totvs_id) {
      activeTotvsId = session.active_totvs_id;
    } else if (cpf.length === 11) {
      const { data: owner, error: ownerErr } = await sb
        .from("users")
        .select("default_totvs_id")
        .eq("cpf", cpf)
        .maybeSingle();

      if (ownerErr) return json({ ok: false, error: "db_error_owner", details: "erro interno" }, 500);
      activeTotvsId = String(owner?.default_totvs_id || "").trim();
    } else {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    if (!activeTotvsId) return json({ ok: false, error: "church_not_found" }, 404);

    const { data: users, error } = await sb
      .from("users")
      .select("id, full_name, role, phone, email, avatar_url, birth_date")
      .eq("is_active", true)
      .eq("default_totvs_id", activeTotvsId)
      .not("birth_date", "is", null);

    if (error) return json({ ok: false, error: "db_error", details: "erro interno" }, 500);

    const todayMD = todayMonthDaySaoPaulo();

    const birthdays = (users || [])
      .filter((u: Record<string, unknown>) => monthDay(String(u.birth_date || "")) === todayMD)
      .slice(0, limit)
      .map((u: Record<string, unknown>) => ({
        id: u.id,
        full_name: u.full_name,
        role: u.role,
        phone: u.phone || null,
        email: u.email || null,
        avatar_url: u.avatar_url || null,
        birth_date: u.birth_date || null,
      }));

    return json({ ok: true, birthdays });
  } catch (err) {
    return json({ ok: false, error: "exception", details: "erro interno" }, 500);
  }
});
