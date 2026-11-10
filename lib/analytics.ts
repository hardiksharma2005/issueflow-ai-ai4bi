// Pure aggregation functions over issue rows (fetched through RLS, so users only ever
// aggregate data they are allowed to see). Kept free of I/O so they are unit-testable.

import {
  ISSUE_CATEGORIES,
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  isUnresolved,
  type IssueCategory,
  type IssuePriority,
  type IssueStatus,
} from "@/lib/domain";

export interface AnalyticsIssue {
  id: string;
  number: number;
  title: string;
  project_id: string;
  status: IssueStatus;
  priority: IssuePriority;
  category: IssueCategory;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  assignee_id: string | null;
}

export const isOverdue = (i: Pick<AnalyticsIssue, "due_date" | "status">, now = new Date()) =>
  Boolean(i.due_date && isUnresolved(i.status) && i.due_date < now.toISOString().slice(0, 10));

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

function weekStart(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (x.getUTCDay() + 6) % 7; // Monday = 0
  x.setUTCDate(x.getUTCDate() - day);
  return x;
}

export function computeDashboard(issues: AnalyticsIssue[], now = new Date(), days = 30) {
  const counts = {
    total: issues.length,
    open: 0,
    inProgress: 0,
    resolved: 0,
    overdue: 0,
    critical: 0,
    blocked: 0,
  };
  const byStatus = Object.fromEntries(ISSUE_STATUSES.map((s) => [s, 0])) as Record<IssueStatus, number>;
  const byPriority = Object.fromEntries(ISSUE_PRIORITIES.map((p) => [p, 0])) as Record<IssuePriority, number>;
  const byCategory = Object.fromEntries(ISSUE_CATEGORIES.map((c) => [c, 0])) as Record<IssueCategory, number>;

  for (const i of issues) {
    byStatus[i.status]++;
    if (isUnresolved(i.status)) {
      byPriority[i.priority]++;
      if (i.priority === "critical") counts.critical++;
    }
    byCategory[i.category]++;
    if (i.status === "open") counts.open++;
    if (i.status === "in_progress") counts.inProgress++;
    if (i.status === "blocked") counts.blocked++;
    if (i.status === "resolved" || i.status === "closed") counts.resolved++;
    if (isOverdue(i, now)) counts.overdue++;
  }

  // Created vs resolved per day for the last `days` days.
  const timeline: { date: string; created: number; resolved: number }[] = [];
  const index = new Map<string, number>();
  for (let d = days - 1; d >= 0; d--) {
    const date = dayKey(new Date(now.getTime() - d * 86_400_000));
    index.set(date, timeline.length);
    timeline.push({ date, created: 0, resolved: 0 });
  }
  for (const i of issues) {
    const c = index.get(i.created_at.slice(0, 10));
    if (c !== undefined) timeline[c].created++;
    if (i.resolved_at) {
      const r = index.get(i.resolved_at.slice(0, 10));
      if (r !== undefined) timeline[r].resolved++;
    }
  }

  // Resolution trend: resolved per week and average days to resolve (last 8 weeks).
  const weeks: { week: string; resolved: number; avgDays: number | null }[] = [];
  const thisWeek = weekStart(now);
  const weekIndex = new Map<string, { total: number; days: number }>();
  for (let w = 7; w >= 0; w--) {
    const start = new Date(thisWeek.getTime() - w * 7 * 86_400_000);
    weekIndex.set(dayKey(start), { total: 0, days: 0 });
  }
  for (const i of issues) {
    if (!i.resolved_at) continue;
    const bucket = weekIndex.get(dayKey(weekStart(new Date(i.resolved_at))));
    if (!bucket) continue;
    bucket.total++;
    bucket.days += (new Date(i.resolved_at).getTime() - new Date(i.created_at).getTime()) / 86_400_000;
  }
  for (const [week, b] of weekIndex) {
    weeks.push({ week, resolved: b.total, avgDays: b.total ? Math.round((b.days / b.total) * 10) / 10 : null });
  }

  return { counts, byStatus, byPriority, byCategory, timeline, resolutionTrend: weeks };
}
