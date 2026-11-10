"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser client (anon/publishable key only). Used for direct-to-storage uploads,
// which are protected by the storage RLS policies in 0004_storage.sql.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
  );
}
