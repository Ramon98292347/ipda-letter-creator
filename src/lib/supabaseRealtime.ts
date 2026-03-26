import { createClient } from "@supabase/supabase-js";

// Comentario: cliente dedicado ao Realtime do Supabase.
// Mantemos separado do wrapper principal porque aqui precisamos de .channel()
// para reagir a mudancas da tabela letters sem depender de polling.
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
// Comentario: aceita tanto VITE_SUPABASE_ANON_KEY (formato antigo) quanto VITE_SUPABASE_PUBLISHABLE_KEY (formato novo do Supabase)
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();

export const supabaseRealtime = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: { eventsPerSecond: 2 },
  },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: "sb-ipda-realtime",
  },
});
