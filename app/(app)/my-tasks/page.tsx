import type { Metadata } from "next";
import { CheckSquare } from "lucide-react";
import { IssueBoard } from "@/components/issues/issue-board";
import { IssueFilters, Pagination } from "@/components/issues/issue-filters";
import { IssueTable } from "@/components/issues/issue-table";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { isOverdue } from "@/lib/analytics";
import { requireViewer } from "@/lib/auth";
import { isUnresolved } from "@/lib/domain";
import { queryIssues } from "@/lib/issue-query";
import { createClient } from "@/lib/supabase/server";
import { issueFiltersSchema } from "@/lib/validation/schemas";

export const metadata: Metadata = { title: "My tasks" };

export default async function MyTasksPage({ searchParams }: PageProps<"/my-tasks">) {
  const viewer = await requireViewer();
  const filters = { ...issueFiltersSchema.parse(await searchParams), assignee: "me" as const };
  const supabase = await createClient();
  const board = filters.view === "board";
  const result = await queryIssues(supabase, { ...filters, sort: filters.sort ?? "due_asc" }, viewer.id, { pageSize: board ? 300 : undefined });
  const now = new Date();
  const open = result.issues.filter((i) => isUnresolved(i.status)).length;
  const overdue = result.issues.filter((i) => isOverdue(i, now)).length;

  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader
        title="My tasks"
        description={`Issues assigned to you · ${open} unresolved${overdue ? ` · ${overdue} overdue` : ""}`}
      />
      <IssueFilters showAssignee={false} />
      {result.issues.length === 0 ? (
        <EmptyState icon={CheckSquare} title="Nothing assigned to you" description="Issues assigned to you will appear here, soonest due date first." />
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
