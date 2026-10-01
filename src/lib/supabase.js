// The Supabase client for accounts and saved builds. The URL and publishable key are public by
// design (the database's Row Level Security decides what each player can see and change: see
// supabase/migrations). Environment variables override them (VITE_SUPABASE_URL/_KEY).
// Loaded on first use, so pages that never sign in don't download it.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://dqkdtibrthvvyqwimwsx.supabase.co";
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_4X6c7yfX-8drsz74RQDEjA_QDSf2ni0";
// Sign-in methods switched on in the Supabase project (Authentication → Providers).
export const AUTH_PROVIDERS = (import.meta.env.VITE_AUTH_PROVIDERS || "google").split(",").map((s) => s.trim()).filter(Boolean);

let client = null;
export async function supabase() {
  if (!client) {
    const { createClient } = await import("@supabase/supabase-js");
    client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" } });
  }
  return client;
}
