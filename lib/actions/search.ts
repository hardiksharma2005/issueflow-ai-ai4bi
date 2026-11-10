"use server";

import { assertViewer } from "@/lib/auth";
import type { SearchHit } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

/** Global search across projects, issues, comments and WhatsApp messages (RLS-scoped). */
export async function searchAll(query: string, limit = 8): Promise<SearchHit[]> {
  await assertViewer();
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_all", { p_query: q, p_limit: Math.min(Math.max(limit, 1), 50) });
  if (error) {
    console.error("[search]", error);
    return [];
  }
  return (data ?? []) as SearchHit[];
}
