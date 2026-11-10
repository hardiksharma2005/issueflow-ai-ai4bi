// Shared search types/helpers (kept out of the "use server" module, which may only export actions).

export interface SearchHit {
  kind: "project" | "issue" | "comment" | "message";
  id: string;
  project_id: string;
  issue_id: string | null;
  import_id: string | null;
  title: string;
  snippet: string | null;
  created_at: string;
}

export function hitHref(h: SearchHit) {
  if (h.kind === "project") return `/projects/${h.id}`;
  if (h.issue_id) return `/issues/${h.issue_id}`;
  if (h.import_id) return `/imports/${h.import_id}`;
  return `/projects/${h.project_id}`;
}
