/**
 * _shared/cors.ts
 * ---------------
 * Cabeçalhos CORS e helper de resposta JSON compartilhados entre todas as edge functions.
 * Importar com: import { corsHeaders, json } from "../_shared/cors.ts";
 */

export function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, X-Cron-Secret",
  };
}

export function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders() });
}
