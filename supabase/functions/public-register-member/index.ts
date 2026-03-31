/**
 * public-register-member
 * ======================
 * O que faz: Permite que um novo membro faça seu próprio pré-cadastro no sistema sem precisar
 *            de um admin/pastor. O cadastro é criado com role="obreiro" e
 *            registration_status="PENDENTE", aguardando aprovação do pastor.
 * Para que serve: Formulário público de auto-cadastro de novos obreiros (página pública do sistema).
 * Quem pode usar: público (sem autenticação)
 * Recebe: { cpf, full_name, minister_role, profession?, baptism_date?, ordination_date?,
 *           phone?, email?, avatar_url?, cep?, address_street?, address_number?,
 *           address_complement?, address_neighborhood?, address_city?, address_state?,
 *           password, totvs_id }
 * Retorna: { ok, user, church, registration_status: "PENDENTE", detail }
 * Observações: CPF duplicado retorna erro. Igreja inativa retorna erro.
 *              O campo totvs_access é criado com registration_status="PENDENTE" para que
 *              o pastor possa aprovar o cadastro depois.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";

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

function onlyDigits(value: string) {
  return String(value || "").replace(/\D+/g, "");
}

function normalizeEmail(value: string | null | undefined) {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}

function normalizePhone(value: string | null | undefined) {
  const phone = onlyDigits(value || "");
  return phone || null;
}

function normalizeMinisterRole(value: string | null | undefined) {
  const raw = String(value || "").trim().toLowerCase();
  const map: Record<string, string> = {
    membro: "Membro",
    obreiro: "Obreiro",
    diacono: "Diacono",
    presbitero: "Presbitero",
    pastor: "Pastor",
    cooperador: "Cooperador",
    voluntario: "Voluntario",
  };
  return map[raw] || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({})) as {
      cpf?: string;
      full_name?: string;
      minister_role?: string | null;
      profession?: string | null;
      baptism_date?: string | null;
      ordination_date?: string | null;
      phone?: string | null;
      email?: string | null;
      avatar_url?: string | null;
      cep?: string | null;
      address_street?: string | null;
      address_number?: string | null;
      address_complement?: string | null;
      address_neighborhood?: string | null;
      address_city?: string | null;
      address_state?: string | null;
      password?: string;
      totvs_id?: string;
    };

    const cpf = onlyDigits(body.cpf || "");
    const fullName = String(body.full_name || "").trim();
    const ministerRole = normalizeMinisterRole(body.minister_role);
    const profession = String(body.profession || "").trim() || null;
    const baptismDate = String(body.baptism_date || "").trim() || null;
    const ordinationDate = String(body.ordination_date || "").trim() || null;
    const password = String(body.password || "");
    const totvsId = String(body.totvs_id || "").trim();
    const phone = normalizePhone(body.phone);
    const email = normalizeEmail(body.email);
    const avatarUrl = String(body.avatar_url || "").trim() || null;
    const cep = onlyDigits(String(body.cep || "")).slice(0, 8) || null;
    const addressStreet = String(body.address_street || "").trim() || null;
    const addressNumber = String(body.address_number || "").trim() || null;
    const addressComplement = String(body.address_complement || "").trim() || null;
    const addressNeighborhood = String(body.address_neighborhood || "").trim() || null;
    const addressCity = String(body.address_city || "").trim() || null;
    const addressState = String(body.address_state || "").trim().toUpperCase().slice(0, 2) || null;

    if (cpf.length !== 11) return json({ ok: false, error: "invalid_cpf" }, 400);
    if (!fullName) return json({ ok: false, error: "missing_full_name" }, 400);
    if (!ministerRole) return json({ ok: false, error: "missing_minister_role" }, 400);
    if (!totvsId) return json({ ok: false, error: "missing_totvs_id" }, 400);
    if (password.length < 6) return json({ ok: false, error: "password_too_short", detail: "A senha deve ter ao menos 6 caracteres." }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data: church, error: churchError } = await sb
      .from("churches")
      .select("totvs_id, church_name, is_active")
      .eq("totvs_id", totvsId)
      .maybeSingle();

    if (churchError) return json({ ok: false, error: "db_error_church", details: churchError.message }, 500);
    if (!church) {
      return json({
        ok: false,
        error: "church_not_found",
        detail: "Sua igreja nao existe no cadastro. Peça ao pastor para cadastrar primeiro.",
      }, 404);
    }
    if (!church.is_active) {
      return json({
        ok: false,
        error: "church_inactive",
        detail: "Essa igreja esta desativada. Procure a secretaria da igreja.",
      }, 409);
    }

    const { data: existing, error: existingError } = await sb
      .from("users")
      .select("id")
      .eq("cpf", cpf)
      .maybeSingle();

    if (existingError) return json({ ok: false, error: "db_error_existing_user", details: existingError.message }, 500);
    if (existing) return json({ ok: false, error: "cpf_already_registered", detail: "CPF ja cadastrado." }, 409);

    const passwordHash = bcrypt.hashSync(password, 10);

    const totvsAccess = [
      {
        totvs_id: totvsId,
        role: "obreiro",
        registration_status: "PENDENTE",
      },
    ];

    const { data: inserted, error: insertError } = await sb
      .from("users")
      .insert({
        cpf,
        full_name: fullName,
        role: "obreiro",
        minister_role: ministerRole,
        profession,
        baptism_date: baptismDate,
        ordination_date: ordinationDate,
        phone,
        email,
        avatar_url: avatarUrl,
        cep,
        address_street: addressStreet,
        address_number: addressNumber,
        address_complement: addressComplement,
        address_neighborhood: addressNeighborhood,
        address_city: addressCity,
        address_state: addressState,
        password_hash: passwordHash,
        default_totvs_id: totvsId,
        totvs_access: totvsAccess,
        is_active: true,
      })
      .select("id, cpf, full_name, role, minister_role, default_totvs_id")
      .single();

    if (insertError) return json({ ok: false, error: "insert_user_failed", details: insertError.message }, 500);

    // [NOVO] Notifica o pastor e o próprio membro sobre o novo cadastro
    try {
      // 1. Descobrir os pastores/secretários da respectiva igreja
      const { data: leaders } = await sb
        .from("users")
        .select("id")
        .eq("default_totvs_id", totvsId)
        .in("role", ["pastor", "secretario"])
        .eq("is_active", true);

      const leaderIds = (leaders || []).map(l => String((l as Record<string, unknown>).id || "")).filter(Boolean);

      // 2. Criar notificação no DB para o próprio membro (para quando ele entrar a primeira vez)
      await sb.from("notifications").insert({
        user_id: inserted.id,
        church_totvs_id: totvsId,
        type: "new_member",
        title: "Cadastro em Análise",
        message: "Seu cadastro foi realizado com sucesso e está aguardando liberação da secretaria ou do pastor.",
        read_at: null,
      });

      // 3. Criar notificação no DB para os líderes da igreja
      const notifyPromises = leaderIds.map(leaderId => 
        sb.from("notifications").insert({
          user_id: leaderId,
          church_totvs_id: totvsId,
          type: "new_member",
          title: "Novo Cadastro Aguardando Liberação",
          message: `O usuário ${fullName} solicitou acesso ao sistema. Vá à aba de Membros Pendentes para analisar.`,
          read_at: null,
        })
      );
      await Promise.all(notifyPromises);

      // 4. Disparar Push Notification imediato para o celular dos pastores chamando a notifications-api
      if (leaderIds.length > 0) {
        const internalKey = String(Deno.env.get("INTERNAL_KEY") || "");
        const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "");
        if (internalKey && supabaseUrl) {
          await fetch(`${supabaseUrl}/functions/v1/notifications-api`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-key": internalKey,
            },
            body: JSON.stringify({
              action: "notify",
              title: "SGE IPDA - Novo Cadastro",
              body: `O usuário ${fullName} solicitou acesso. Libere o acesso no sistema agora!`,
              url: "/pastor/membros?filter=pendentes",
              user_ids: leaderIds,
            }),
          }).catch(err => console.error("Falha ao disparar webpush na registration:", err));
        }
      }
    } catch (notifyErr) {
      console.error("Falha silenciosa criar notificações de novo usuario:", notifyErr);
    }

    return json({
      ok: true,
      user: inserted,
      church: {
        totvs_id: church.totvs_id,
        church_name: church.church_name,
      },
      registration_status: "PENDENTE",
      detail: "Cadastro recebido. Aguardando liberacao da secretaria/pastor.",
    }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
