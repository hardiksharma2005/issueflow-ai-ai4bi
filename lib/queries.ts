import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportIssue } from "@/lib/reports";

export const ISSUE_LIST_SELECT =
  "*, project:projects(id, key, name), assignee:profiles!issues_assignee_id_fkey(id, full_name, email)";

/** All issues visible to the current user (RLS), for analytics and reports. */
export async function fetchIssuesForReports(supabase: SupabaseClient, projectId?: string) {
  let query = supabase
    .from("issues")
    .select(
      "id, number, title, status, priority, category, due_date, created_at, updated_at, resolved_at, project_id, assignee_id, project:projects(id, key, name), assignee:profiles!issues_assignee_id_fkey(id, full_name, email)",
    )
    .order("created_at", { ascending: false })
    .limit(5000);
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as (ReportIssue & { project_id: string; assignee_id: string | null })[];
}
