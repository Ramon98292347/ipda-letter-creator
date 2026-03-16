import { createClient } from "@supabase/supabase-js";
import { getRlsToken, clearRlsToken } from "@/lib/api";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = url && key
  ? createClient(url, key, {
      global: {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const headers = new Headers(init?.headers || {});
          const rlsToken = getRlsToken();
          if (rlsToken) headers.set("Authorization", `Bearer ${rlsToken}`);
          const res = await fetch(input, { ...(init || {}), headers });
          // Se o Supabase rejeitar o rls_token com 401, limpa o token para que
          // as próximas chamadas usem o fallback via Edge Functions.
          if (res.status === 401 && rlsToken) {
            clearRlsToken();
          }
          return res;
        },
      },
    })
  : undefined;
