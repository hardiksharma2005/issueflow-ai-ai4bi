"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { PriorityIcon, StatusIcon } from "@/components/shared/badges";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateIssue } from "@/lib/actions/issues";
import {
  CATEGORY_LABELS,
  ISSUE_CATEGORIES,
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type IssuePriority,
  type IssueStatus,
} from "@/lib/domain";
import type { Issue } from "@/types/db";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}

export function IssueProperties({
  issue,
  members,
  canManage,
  canChangeStatus,
}: {
  issue: Issue;
  members: { id: string; name: string }[];
  canManage: boolean;
  canChangeStatus: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const save = (patch: Record<string, unknown>) =>
    start(async () => {
      const res = await updateIssue({ id: issue.id, ...patch });
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
      router.refresh();
    });

  const trigger = "h-8 w-full";
  return (
    <div className="divide-y" aria-busy={pending}>
      <Row label="Status">
        <Select value={issue.status} onValueChange={(v) => save({ status: v })} disabled={!canChangeStatus || pending}>
          <SelectTrigger className={trigger} aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ISSUE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                <StatusIcon status={s as IssueStatus} /> {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="Priority">
        <Select value={issue.priority} onValueChange={(v) => save({ priority: v })} disabled={!canManage || pending}>
          <SelectTrigger className={trigger} aria-label="Priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ISSUE_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                <PriorityIcon priority={p as IssuePriority} /> {PRIORITY_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="Category">
        <Select value={issue.category} onValueChange={(v) => save({ category: v })} disabled={!canManage || pending}>
          <SelectTrigger className={trigger} aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ISSUE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="Assignee">
        <Select value={issue.assignee_id ?? "none"} onValueChange={(v) => save({ assigneeId: v })} disabled={!canManage || pending}>
          <SelectTrigger className={trigger} aria-label="Assignee">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Unassigned</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="Due date">
        <Input
          type="date"
          className={trigger}
          defaultValue={issue.due_date ?? ""}
          disabled={!canManage || pending}
          aria-label="Due date"
          onBlur={(e) => {
            if ((e.target.value || null) !== issue.due_date) save({ dueDate: e.target.value || null });
          }}
        />
      </Row>
    </div>
  );
}
