import type { Metadata } from "next";
import { ListTodo, Plus } from "lucide-react";
import { IssueBoard } from "@/components/issues/issue-board";
import { IssueFilters, Pagination } from "@/components/issues/issue-filters";
import { IssueTable } from "@/components/issues/issue-table";
import { NewIssueDialog } from "@/components/issues/new-issue-dialog";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { requireViewer } from "@/lib/auth";
import { projectsWithMembers, queryIssues } from "@/lib/issue-query";
import { createClient } from "@/lib/supabase/server";
import { issueFiltersSchema } from "@/lib/validation/schemas";

export const metadata: Metadata = { title: "All issues" };

export default async function IssuesPage({ searchParams }: PageProps<"/issues">) {
  const viewer = await requireViewer();
  const filters = issueFiltersSchema.parse(await searchParams);
  const supabase = await createClient();
  const board = filters.view === "board";

  const [result, projects, { data: manageable }] = await Promise.all([
    queryIssues(supabase, filters, viewer.id, { pageSize: board ? 300 : undefined }),
    projectsWithMembers(supabase),
    supabase.rpc("is_admin"),
  ]);

  // Managers can create issues in projects they belong to; admins everywhere.
  const creatable = viewer.profile.role === "member" ? [] : manageable ? projects : projects.filter((p) => p.members.some((m) => m.id === viewer.id));
  const people = [...new Map(projects.flatMap((p) => p.members).map((m) => [m.id, { value: m.id, label: m.name }])).values()];

  return (
    <div className="grid gap-5">
      <div>
        <Breadcrumbs items={[{ label: "Overview", href: "/dashboard" }, { label: "All issues" }]} />
        <PageHeader
          title="All issues"
          description={`${result.count} issue(s) match your filters`}
          actions={
            creatable.length > 0 && (
              <NewIssueDialog
                projects={creatable}
                defaultProjectId={filters.project}
                trigger={
                  <Button>
                    <Plus /> New issue
                  </Button>
                }
              />
            )
          }
        />
      </div>
      <IssueFilters projects={projects.map((p) => ({ value: p.id, label: p.name }))} people={people} />
      {result.issues.length === 0 ? (
        <EmptyState icon={ListTodo} title="No issues found" description="Try clearing some filters, or import a WhatsApp conversation." />
      ) : board ? (
        <IssueBoard issues={result.issues} />
      ) : (
        <>
          <IssueTable issues={result.issues} />
          <Pagination page={result.page} pageSize={result.pageSize} count={result.count} />
        </>
      )}
    </div>
  );
}
