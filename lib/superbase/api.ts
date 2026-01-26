import { createClient } from "@supabase/supabase-js";

/**
 * Supabase Client für API-Routes (ohne Cookie-Verwaltung)
 * Verwendet direkt die Umgebungsvariablen ohne SSR-Features
 */
export function createApiClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen: NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY müssen gesetzt sein"
    );
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false, // Keine Session-Persistierung in API-Routes
      autoRefreshToken: false,
    },
  });
}
