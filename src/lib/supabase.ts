import { createClient } from "@supabase/supabase-js";
import { getRlsToken, clearRlsToken } from "@/lib/api";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Comentario: aceita tanto VITE_SUPABASE_ANON_KEY quanto VITE_SUPABASE_PUBLISHABLE_KEY (novo formato do Supabase)
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined;

export const supabase = url && key
  ? createClient(url, key, {
      global: {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const requestUrl = String(input);
          const headers = new Headers(init?.headers || {});
          const rlsToken = getRlsToken();
          const isStorageRequest = requestUrl.includes("/storage/v1/");

          // O rls_token e legado e falha com frequencia fora do PostgREST.
          // Em uploads para o Storage ele pode gerar 400/401, entao nao o
          // enviamos nessas rotas.
          if (rlsToken && !isStorageRequest) headers.set("Authorization", `Bearer ${rlsToken}`);

          const res = await fetch(input, { ...(init || {}), headers });
          // Se o Supabase rejeitar o rls_token com 401, limpa o token para que
          // as proximas chamadas usem o fallback via Edge Functions.
          if (res.status === 401 && rlsToken && !isStorageRequest) {
            clearRlsToken();
          }
          return res;
        },
      },
    })
  : undefined;

// Cliente anonimo sem injecao de rls_token, usado em queries publicas
// para nao interferir na sessao.
export const supabaseAnon = url && key ? createClient(url, key) : undefined;
