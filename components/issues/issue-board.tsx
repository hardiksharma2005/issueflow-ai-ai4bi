"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { PriorityIcon, StatusIcon } from "@/components/shared/badges";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateIssue } from "@/lib/actions/issues";
import { isOverdue } from "@/lib/analytics";
import { ISSUE_STATUSES, STATUS_LABELS, type IssueStatus } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { IssueListItem } from "@/types/db";

export function IssueBoard({ issues }: { issues: IssueListItem[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [optimistic, move] = useOptimistic(issues, (state, { id, status }: { id: string; status: IssueStatus }) =>
    state.map((i) => (i.id === id ? { ...i, status } : i)),
  );
  const [dragOver, setDragOver] = useState<IssueStatus | null>(null);
  const now = new Date();

  const changeStatus = (id: string, status: IssueStatus) => {
    const current = optimistic.find((i) => i.id === id);
    if (!current || current.status === status) return;
    start(async () => {
      move({ id, status });
      const res = await updateIssue({ id, status });
      if (res.ok) toast.success(`${current.project?.key}-${current.number} → ${STATUS_LABELS[status]}`);
      else toast.error(res.error);
      router.refresh();
    });
  };

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6">
      <div className="grid min-w-[72rem] grid-cols-6 gap-3">
        {ISSUE_STATUSES.map((status) => {
          const column = optimistic.filter((i) => i.status === status);
          return (
            <section
              key={status}
              aria-label={STATUS_LABELS[status]}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(status);
              }}
              onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                changeStatus(e.dataTransfer.getData("text/issue-id"), status);
              }}
              className={cn(
                "flex min-h-96 flex-col rounded-xl border bg-muted/30 p-2 transition-colors",
                dragOver === status && "border-primary/50 bg-primary/5",
              )}
            >
              <header className="flex items-center gap-2 px-1.5 pt-1 pb-2 text-sm font-medium">
                <StatusIcon status={status} />
                {STATUS_LABELS[status]}
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">{column.length}</span>
              </header>
              <ul className="grid grid-cols-1 gap-2">
                {column.map((i) => (
                  <li
                    key={i.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/issue-id", i.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className="group relative cursor-grab rounded-lg border bg-card p-2.5 shadow-xs transition-shadow hover:shadow-sm active:cursor-grabbing"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {i.project?.key}-{i.number}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-xs" className="relative z-10 opacity-60 group-hover:opacity-100" aria-label={`Move ${i.project?.key}-${i.number}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Move to</DropdownMenuLabel>
                          {ISSUE_STATUSES.filter((s) => s !== i.status).map((s) => (
                            <DropdownMenuItem key={s} onSelect={() => changeStatus(i.id, s)}>
                              <StatusIcon status={s} /> {STATUS_LABELS[s]}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <Link href={`/issues/${i.id}`} className="mt-1 line-clamp-3 block text-sm font-medium after:absolute after:inset-0 hover:text-primary" draggable={false}>
                      {i.title}
                    </Link>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <PriorityIcon priority={i.priority} />
                      {i.due_date && (
                        <span className={cn(isOverdue(i, now) && "font-medium text-destructive")}>{formatDate(i.due_date, "d MMM")}</span>
                      )}
                      <span className="ml-auto">
                        {i.assignee ? <UserAvatar name={i.assignee.full_name || i.assignee.email} size="sm" /> : null}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              {column.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Drop issues here</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
