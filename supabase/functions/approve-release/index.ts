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

type SessionClaims = {
  user_id: string;
  role: Role;
  active_totvs_id: string;
};

type Body = {
  request_id?: string;
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
    if (!["admin", "pastor", "obreiro"].includes(role)) return null;

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
    const request_id = String(body.request_id || "").trim();
    if (!request_id) return json({ ok: false, error: "missing_request_id" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data: reqRow, error: reqErr } = await sb
      .from("release_requests")
      .select("id, church_totvs_id, letter_id, requester_user_id, status")
      .eq("id", request_id)
      .maybeSingle();

    if (reqErr) return json({ ok: false, error: "db_error_request", details: reqErr.message }, 500);
    if (!reqRow) return json({ ok: false, error: "request_not_found" }, 404);

    if (String(reqRow.church_totvs_id) !== String(session.active_totvs_id)) {
      return json({ ok: false, error: "forbidden_wrong_church" }, 403);
    }
    if (String(reqRow.status) !== "PENDENTE") {
      return json({ ok: false, error: "request_not_pending", status: reqRow.status }, 409);
    }

    const { data: letter, error: letterErr } = await sb
      .from("letters")
      .select("id, church_totvs_id, status, storage_path, preacher_name")
      .eq("id", reqRow.letter_id)
      .maybeSingle();

    if (letterErr) return json({ ok: false, error: "db_error_letter", details: letterErr.message }, 500);
    if (!letter) return json({ ok: false, error: "letter_not_found" }, 404);

    if (String(letter.church_totvs_id) !== String(session.active_totvs_id)) {
      return json({ ok: false, error: "forbidden_wrong_church_letter" }, 403);
    }

    if (!String(letter.storage_path || "").trim()) {
      return json(
        {
          ok: false,
          error: "cannot_release_without_pdf",
          detail: "Nao e possivel liberar carta sem PDF pronto.",
        },
        409,
      );
    }

    const { data: reqUpdated, error: updReqErr } = await sb
      .from("release_requests")
      .update({ status: "APROVADO" })
      .eq("id", request_id)
      .select("id, status, updated_at")
      .single();
    if (updReqErr) return json({ ok: false, error: "db_error_update_request", details: updReqErr.message }, 500);

    const { data: letterUpdated, error: updLetterErr } = await sb
      .from("letters")
      .update({ status: "LIBERADA" })
      .eq("id", reqRow.letter_id)
      .select("id, status, updated_at")
      .single();
    if (updLetterErr) return json({ ok: false, error: "db_error_update_letter", details: updLetterErr.message }, 500);

    await sb.from("notifications").insert({
      church_totvs_id: session.active_totvs_id,
      user_id: reqRow.requester_user_id,
      title: "Carta liberada",
      message: `Sua carta de ${letter.preacher_name || "pregacao"} foi liberada.`,
      type: "release_approved",
      read_at: null,
    });

    return json({ ok: true, request: reqUpdated, letter: letterUpdated }, 200);
  } catch (err) {
    return json({ ok: false, error: "exception", details: String(err) }, 500);
  }
});
