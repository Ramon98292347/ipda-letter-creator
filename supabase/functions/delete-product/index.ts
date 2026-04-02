import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return json({ ok: false, error: "id_required" }, 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    const { error } = await sb
      .from("deposit_products")
      .delete()
      .eq("id", id);

    if (error) {
      return json({ ok: false, error: error.message }, 500);
    }

    return json({ ok: true });
  } catch (error: any) {
    console.error("Error:", error);
    return json(
      { ok: false, error: error?.message || "Internal error" },
      500
    );
  }
});
