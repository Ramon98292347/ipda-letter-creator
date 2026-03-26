/**
 * birthday-notify
 * ===============
 * O que faz: Roda uma vez por dia (via cron) e envia mensagem de parabéns
 *            para todos os aniversariantes do dia em todas as igrejas.
 *
 * Como funciona:
 *  1. Busca todos os membros ativos com aniversário hoje (fuso São Paulo)
 *  2. Agrupa por igreja (default_totvs_id)
 *  3. Para cada igreja que tem aniversariante, dispara o webhook do n8n
 *
 * Quem chama: Cron do Supabase (pg_cron) — todo dia às 06:00 horário de Brasília
 * Autenticação: chave secreta via header X-Cron-Secret (variável CRON_SECRET)
 *
 * Variáveis de ambiente necessárias:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   N8N_BIRTHDAYS_WEBHOOK_URL
 *   CRON_SECRET  — segredo para impedir chamadas externas não autorizadas
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const N8N_WEBHOOK = Deno.env.get("N8N_BIRTHDAYS_WEBHOOK_URL")
  || "https://n8n-n8n.ynlng8.easypanel.host/webhook/senha";

const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, X-Cron-Secret",
  };
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders() });
}

// Retorna a data de hoje no fuso de São Paulo no formato "MM-DD" (para comparar com birth_date)
function todayMonthDaySaoPaulo(): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const mm = parts.find((p) => p.type === "month")?.value || "01";
  const dd = parts.find((p) => p.type === "day")?.value || "01";
  return `${mm}-${dd}`;
}

// Extrai "MM-DD" de uma data no formato "YYYY-MM-DD"
function monthDay(dateStr: string): string | null {
  const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[2]}-${m[3]}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  // Comentario: valida o segredo do cron para que ninguém externo dispare a função
  if (CRON_SECRET) {
    const secret = req.headers.get("x-cron-secret") || "";
    if (secret !== CRON_SECRET) return json({ ok: false, error: "unauthorized" }, 401);
  }

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    // Comentario: busca TODOS os membros ativos com data de aniversário preenchida
    const { data: users, error } = await sb
      .from("users")
      .select("id, full_name, phone, email, birth_date, default_totvs_id")
      .eq("is_active", true)
      .not("birth_date", "is", null);

    if (error) return json({ ok: false, error: "db_error", details: error.message }, 500);

    const todayMD = todayMonthDaySaoPaulo();

    // Comentario: filtra só quem faz aniversário hoje e agrupa por igreja
    const byChurch = new Map<string, typeof users>();

    for (const user of (users || [])) {
      if (monthDay(String(user.birth_date || "")) !== todayMD) continue;
      const church = String(user.default_totvs_id || "");
      if (!church) continue;
      if (!byChurch.has(church)) byChurch.set(church, []);
      byChurch.get(church)!.push(user);
    }

    if (byChurch.size === 0) {
      return json({ ok: true, message: "Nenhum aniversariante hoje.", churches: 0, sent: 0 });
    }

    let sent = 0;
    let failed = 0;
    let notifications = 0;
    const today = new Date().toISOString().slice(0, 10);

    // Comentario: para cada igreja com aniversariante, dispara o webhook do n8n
    for (const [churchTotvsId, birthdays] of byChurch) {
      const existing = await sb
        .from("notifications")
        .select("id")
        .eq("church_totvs_id", churchTotvsId)
        .eq("type", "birthday")
        .gte("created_at", `${today}T00:00:00.000Z`)
        .limit(1);

      if (!existing.error && (existing.data || []).length === 0) {
        const nomes = birthdays.map((b) => b.full_name).join(", ");
        const title = birthdays.length === 1
          ? `Aniversário: ${birthdays[0].full_name}`
          : `${birthdays.length} aniversariantes hoje`;
        const message = birthdays.length === 1
          ? `${birthdays[0].full_name} faz aniversário hoje! Envie parabéns.`
          : `Aniversariantes: ${nomes}`;

        const { data: leaders } = await sb
          .from("users")
          .select("id")
          .eq("default_totvs_id", churchTotvsId)
          .in("role", ["pastor", "secretario"])
          .eq("is_active", true);

        const leaderIds = (leaders || []).map((l) => String((l as Record<string, unknown>).id || "")).filter(Boolean);
        if (leaderIds.length > 0) {
          await sb.from("notifications").insert(
            leaderIds.map((leaderId) => ({
              church_totvs_id: churchTotvsId,
              user_id: leaderId,
              type: "birthday",
              title,
              message,
              is_read: false,
              read_at: null,
              data: {
                date: today,
                birthdays: birthdays.map((b) => ({
                  id: b.id,
                  full_name: b.full_name,
                  phone: b.phone || null,
                  email: b.email || null,
                  birth_date: b.birth_date || null,
                })),
              },
            })),
          );
          notifications += leaderIds.length;
        }
      }

      try {
        const resp = await fetch(N8N_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "aniversario",
            event_type: "aniversario",
            requested_at: new Date().toISOString(),
            church_totvs_id: churchTotvsId,
            birthdays: birthdays.map((b) => ({
              id: b.id,
              full_name: b.full_name,
              phone: b.phone || null,
              email: b.email || null,
              birth_date: b.birth_date || null,
            })),
            date: today,
          }),
        });
        if (resp.ok) sent++; else failed++;
      } catch {
        failed++;
      }
    }

    return json({
      ok: true,
      churches: byChurch.size,
      sent,
      failed,
      notifications,
      date: today,
    });

  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
