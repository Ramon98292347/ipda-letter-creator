import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SendInternalPushParams = {
  title: string;
  body: string;
  url?: string;
  user_ids?: string[];
  totvs_ids?: string[];
  data?: Record<string, unknown>;
};

// Comentario: helper compartilhado para acionar a notifications-api via chave interna.
// Mantem o envio de push centralizado em uma unica function.
export async function sendInternalPushNotification(params: SendInternalPushParams): Promise<boolean> {
  const internalKey = String(Deno.env.get("INTERNAL_KEY") || "").trim();
  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!internalKey || !supabaseUrl || !serviceRoleKey) return false;

  const userIds = Array.isArray(params.user_ids) ? params.user_ids.filter(Boolean) : [];
  const totvsIds = Array.isArray(params.totvs_ids) ? params.totvs_ids.filter(Boolean) : [];
  if (userIds.length === 0 && totvsIds.length === 0) return false;

  try {
    const resp = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/notifications-api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey,
        "x-internal-key": internalKey,
      },
      body: JSON.stringify({
        action: "notify",
        title: params.title,
        body: params.body,
        url: params.url || "/",
        user_ids: userIds,
        totvs_ids: totvsIds,
        data: params.data || {},
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

type InsertNotificationParams = {
  church_totvs_id: string;
  user_id?: string | null;
  type: string;
  title: string;
  message: string;
};

// Comentario: insere uma notificacao padrao na tabela notifications.
export async function insertNotification(params: InsertNotificationParams): Promise<void> {
  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!supabaseUrl || !serviceRoleKey) return;

  const sb = createClient(supabaseUrl, serviceRoleKey);
  await sb.from("notifications").insert({
    church_totvs_id: params.church_totvs_id,
    user_id: params.user_id || null,
    type: params.type,
    title: params.title,
    message: params.message,
    read_at: null,
  });
}
