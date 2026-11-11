// Public (browser-safe) configuration. Server secrets are read in lib/supabase/admin.ts only.

export function supabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set. Copy .env.example to .env.local.");
  return normalizeSupabaseUrl(url);
}

/** Tolerates a pasted REST endpoint ("https://x.supabase.co/rest/v1/"): the clients need the bare origin. */
export function normalizeSupabaseUrl(url: string) {
  try {
    return new URL(url.trim()).origin;
  } catch {
    return url;
  }
}

/** Accepts either the legacy anon key or the newer publishable key. */
export function supabaseAnonKey() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) is not set.");
  }
  return key;
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  );
}

/** Base URL for links in auth emails. On Vercel, falls back to the project's production domain. */
export function siteUrl() {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return (process.env.NEXT_PUBLIC_SITE_URL || (vercel ? `https://${vercel}` : "http://localhost:3000")).replace(/\/$/, "");
}
