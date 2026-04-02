import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.4.1";

const corsHeaders = () => ({
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-admin-key, x-client-info",
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}

async function getAuthUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  try {
    const token = authHeader.replace("Bearer ", "");
    // Tenta USER_SESSION_JWT_SECRET primeiro, depois SUPABASE_JWT_SECRET como fallback
    const secretKey = Deno.env.get("USER_SESSION_JWT_SECRET") || Deno.env.get("SUPABASE_JWT_SECRET") || "";
    const secret = new TextEncoder().encode(secretKey);
    const verified = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    return verified.payload;
  } catch (err) {
    console.error("[auth] JWT validation error:", err);
    return null;
  }
}

async function handleRegister(req: Request, sb: any) {
  try {
    const body = await req.json();
    const {
      church_code,
      church_name,
      city_state,
      pastor_name,
      vehicle_plate,
      leader_name,
      leader_whatsapp,
      passenger_count,
    } = body;

    // Validações básicas
    if (!church_name?.trim()) {
      return json({ ok: false, error: "church_name_required" }, 400);
    }
    if (!leader_name?.trim()) {
      return json({ ok: false, error: "leader_name_required" }, 400);
    }
    if (!leader_whatsapp?.trim()) {
      return json({ ok: false, error: "leader_whatsapp_required" }, 400);
    }

    const { data, error } = await sb.from("caravanas").insert({
      church_code: church_code || null,
      church_name,
      city_state: city_state || null,
      pastor_name: pastor_name || null,
      vehicle_plate: vehicle_plate || null,
      leader_name,
      leader_whatsapp,
      passenger_count: parseInt(String(passenger_count)) || 0,
    }).select("id").single();

    if (error) throw error;

    // Dispara webhook n8n
    try {
      const webhookUrl = Deno.env.get("CARAVANAS_WEBHOOK_URL");
      if (webhookUrl) {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "register",
            id: data?.id,
            church_code: church_code || null,
            church_name,
            city_state: city_state || null,
            pastor_name: pastor_name || null,
            vehicle_plate: vehicle_plate || null,
            leader_name,
            leader_whatsapp,
            passenger_count: parseInt(String(passenger_count)) || 0,
            created_at: new Date().toISOString(),
          }),
        }).catch((err) => console.warn("[webhook] erro ao enviar:", err));
      }
    } catch (err) {
      console.warn("[webhook] falha silenciosa:", err);
    }

    return json({ ok: true, id: data?.id });
  } catch (error) {
    console.error("[register] erro:", error);
    return json({ ok: false, error: "internal_error" }, 500);
  }
}

async function handleList(req: Request, sb: any, user: any) {
  try {
    const body = await req.json();
    const { status, search, church_code: filterChurch } = body;

    const isAdmin = String(user?.role || "").toLowerCase() === "admin";
    const userRole = String(user?.role || "").toLowerCase();
    const userScopes = (user?.totvs_access || user?.scope_totvs_ids || []).filter(Boolean);
    const activeTotvs = String(user?.active_totvs_id || "");

    let query = sb.from("caravanas").select("*");

    // Filtro por status
    if (status && status !== "todas") {
      query = query.eq("status", status);
    }

    // Filtro por busca
    if (search?.trim()) {
      const searchLower = search.toLowerCase();
      query = query.or(
        `church_name.ilike.%${searchLower}%,leader_name.ilike.%${searchLower}%,pastor_name.ilike.%${searchLower}%`
      );
    }

    // Filtro por escopo: admin vê tudo, pastor vê apenas suas churches
    if (!isAdmin) {
      if (userScopes.length > 0) {
        query = query.in("church_code", userScopes);
      } else if (activeTotvs) {
        query = query.eq("church_code", activeTotvs);
      }
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) throw error;

    return json({ ok: true, caravanas: data || [] });
  } catch (error) {
    console.error("[list] erro:", error);
    return json({ ok: false, error: "internal_error" }, 500);
  }
}

async function handleConfirm(req: Request, sb: any, user: any) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return json({ ok: false, error: "id_required" }, 400);
    }

    // Busca a caravana para validar permissão
    const { data: caravan, error: fetchError } = await sb
      .from("caravanas")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !caravan) {
      return json({ ok: false, error: "caravan_not_found" }, 404);
    }

    // Validar acesso: admin ou pastor do escopo
    const isAdmin = String(user?.role || "").toLowerCase() === "admin";
    const userScopes = (user?.totvs_access || user?.scope_totvs_ids || []).filter(Boolean);
    const activeTotvs = String(user?.active_totvs_id || "");
    const canAccess = isAdmin || userScopes.includes(String(caravan.church_code)) || (activeTotvs === String(caravan.church_code));

    if (!canAccess) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    // Update status
    const { error: updateError } = await sb
      .from("caravanas")
      .update({ status: "Confirmada", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) throw updateError;

    // Webhook de confirmação
    try {
      const webhookUrl = Deno.env.get("CARAVANAS_WEBHOOK_URL");
      if (webhookUrl) {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "confirm",
            id,
            church_name: caravan.church_name,
            leader_name: caravan.leader_name,
            pastor_name: caravan.pastor_name,
            confirmed_at: new Date().toISOString(),
          }),
        }).catch((err) => console.warn("[webhook] erro ao enviar:", err));
      }
    } catch (err) {
      console.warn("[webhook] falha silenciosa:", err);
    }

    return json({ ok: true });
  } catch (error) {
    console.error("[confirm] erro:", error);
    return json({ ok: false, error: "internal_error" }, 500);
  }
}

async function handleDelete(req: Request, sb: any, user: any) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return json({ ok: false, error: "id_required" }, 400);
    }

    // Apenas admin pode deletar
    const isAdmin = String(user?.role || "").toLowerCase() === "admin";
    if (!isAdmin) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const { error } = await sb.from("caravanas").delete().eq("id", id);

    if (error) throw error;

    return json({ ok: true });
  } catch (error) {
    console.error("[delete] erro:", error);
    return json({ ok: false, error: "internal_error" }, 500);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || ""
    );

    const body = await req.json();
    const { action } = body;

    // Register não precisa de autenticação
    if (action === "register") {
      return await handleRegister(req, sb);
    }

    // Outras ações requerem JWT
    const user = await getAuthUser(req);
    if (!user) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    switch (action) {
      case "list":
        return await handleList(req, sb, user);
      case "confirm":
        return await handleConfirm(req, sb, user);
      case "delete":
        return await handleDelete(req, sb, user);
      default:
        return json({ ok: false, error: "unknown_action" }, 400);
    }
  } catch (error) {
    console.error("[caravanas-api] erro:", error);
    return json({ ok: false, error: "internal_error" }, 500);
  }
});
