"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

// Browser client (anon/publishable key only). Used for direct-to-storage uploads,
// which are protected by the storage RLS policies in 0004_storage.sql.
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
