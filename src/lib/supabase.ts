import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "";

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Every Supabase query must read fresh data. Next.js caches `fetch`
// responses in its Data Cache by default, and `force-dynamic` on a
// route does NOT stop that — the per-finding ideas endpoint kept
// returning a deleted idea for hours after the tables were empty,
// while the global endpoint (same tables) was already correct. So the
// client itself forces `cache: "no-store"` on every request. This is
// the single fix for the whole app: no route can serve a stale
// Supabase read again, and no per-route cache flag needs remembering.
// (Freshness matters more than caching here — the data is small and
// the workshop edits it constantly.)
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
      global: {
        fetch: (input: any, init?: any) =>
          fetch(input, { ...init, cache: "no-store" }),
      },
    })
  : null;
