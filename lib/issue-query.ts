import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ISSUE_LIST_SELECT } from "@/lib/queries";
import type { IssueFilters } from "@/lib/validation/schemas";
import type { IssueListItem } from "@/types/db";

export const PAGE_SIZE = 25;

/** Keep only characters that are safe inside a PostgREST filter value. */
export function sanitizeSearch(q: string) {
  return q
    .replace(/[^\p{L}\p{N} \-.'#@/:]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

export async function queryIssues(
  supabase: SupabaseClient,
  filters: IssueFilters,
  viewerId: string,
  opts: { pageSize?: number; projectId?: string } = {},
) {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const page = filters.page ?? 1;
  let query = supabase.from("issues").select(ISSUE_LIST_SELECT, { count: "exact" });

  const projectId = opts.projectId ?? filters.project;
  if (projectId) query = query.eq("project_id", projectId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.assignee === "me") query = query.eq("assignee_id", viewerId);
  else if (filters.assignee === "unassigned") query = query.is("assignee_id", null);
  else if (filters.assignee) query = query.eq("assignee_id", filters.assignee);
  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00Z`);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59Z`);

  if (filters.q) {
    const q = sanitizeSearch(filters.q);
    const keyMatch = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(q);
    const keyProject = keyMatch
      ? (await supabase.from("projects").select("id").eq("key", keyMatch[1].toUpperCase()).maybeSingle()).data
      : null;
    if (keyMatch && keyProject) {
      query = query.eq("project_id", keyProject.id).eq("number", Number(keyMatch[2]));
    } else if (q) {
      query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
    }
  }

  switch (filters.sort) {
    case "created_asc":
      query = query.order("created_at", { ascending: true });
      break;
    case "due_asc":
      query = query.order("due_date", { ascending: true, nullsFirst: false });
      break;
    case "due_desc":
      query = query.order("due_date", { ascending: false, nullsFirst: false });
      break;
    case "priority":
      query = query.order("priority", { ascending: true }).order("created_at", { ascending: false });
      break;
    case "updated_desc":
      query = query.order("updated_at", { ascending: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  query = query.range((page - 1) * pageSize, page * pageSize - 1);
  const { data, count, error } = await query;
  if (error) throw error;
  return { issues: (data ?? []) as IssueListItem[], count: count ?? 0, page, pageSize };
}

/** Projects with their members — used by assignee pickers. */
export async function projectsWithMembers(supabase: SupabaseClient) {
  const [{ data: projects }, { data: members }] = await Promise.all([
    supabase.from("projects").select("id, key, name").order("name"),
    supabase.from("project_members").select("project_id, profile:profiles(id, full_name, email)"),
  ]);
  return (projects ?? []).map((p) => ({
    ...p,
    members: (members ?? [])
      .filter((m) => m.project_id === p.id && m.profile)
      .map((m) => {
        const prof = m.profile as unknown as { id: string; full_name: string; email: string };
        return { id: prof.id, name: prof.full_name || prof.email };
      }),
  }));
}
export type ProjectWithMembers = Awaited<ReturnType<typeof projectsWithMembers>>[number];
