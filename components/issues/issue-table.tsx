import Link from "next/link";
import { CategoryBadge, PriorityBadge, StatusBadge } from "@/components/shared/badges";
import { PersonLabel } from "@/components/shared/user-avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isOverdue } from "@/lib/analytics";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { IssueListItem } from "@/types/db";

export function IssueTable({ issues, showProject = true }: { issues: IssueListItem[]; showProject?: boolean }) {
  const now = new Date();
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-24">ID</TableHead>
            <TableHead>Title</TableHead>
            {showProject && <TableHead className="hidden lg:table-cell">Project</TableHead>}
            <TableHead>Status</TableHead>
            <TableHead className="hidden sm:table-cell">Priority</TableHead>
            <TableHead className="hidden md:table-cell">Assignee</TableHead>
            <TableHead className="hidden md:table-cell">Due</TableHead>
            <TableHead className="hidden xl:table-cell">Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.map((i) => {
            const overdue = isOverdue(i, now);
            return (
              <TableRow key={i.id} className="group relative">
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {i.project?.key}-{i.number}
                </TableCell>
                <TableCell className="max-w-[28rem]">
                  {/* Whole-row link via an overlay keeps the table semantic and keyboard friendly. */}
                  <Link href={`/issues/${i.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
                    <span className="block truncate font-medium group-hover:text-primary">{i.title}</span>
                  </Link>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <CategoryBadge category={i.category} />
                    {i.source === "whatsapp_import" && <span className="text-[11px] text-muted-foreground">via WhatsApp</span>}
                  </span>
                </TableCell>
                {showProject && <TableCell className="hidden text-muted-foreground lg:table-cell">{i.project?.name}</TableCell>}
                <TableCell>
                  <StatusBadge status={i.status} />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <PriorityBadge priority={i.priority} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {i.assignee ? (
                    <PersonLabel name={i.assignee.full_name || i.assignee.email} className="max-w-36 text-sm" />
                  ) : (
                    <span className="text-sm text-muted-foreground">Unassigned</span>
                  )}
                </TableCell>
                <TableCell className={cn("hidden text-sm md:table-cell", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                  {formatDate(i.due_date, "d MMM")}
                  {overdue && <span className="sr-only"> (overdue)</span>}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">{formatDate(i.created_at, "d MMM")}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
