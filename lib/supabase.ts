// The one Supabase client for the browser: accounts (email + password) and your saved plan.
// The login session is kept in a cookie (not localStorage), so the server can check it too
// and send logged-out visitors to /login before a protected page is even sent (proxy.ts).
// NEXT_PUBLIC_ values are baked into the browser bundle at build time, so they must be written
// out literally. The publishable (anon) key is public by design: Row Level Security protects the data.
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const url = supabaseUrl;
const key = supabaseKey;

export const supabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured || typeof window === "undefined") return null;
  client ??= createBrowserClient(url!, key!);
  return client;
}
