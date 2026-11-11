// Report definitions shared by the Reports page (tables) and the CSV export route.

import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  ISSUE_PRIORITIES,
  STATUS_LABELS,
  isUnresolved,
  type IssueCategory,
  type IssuePriority,
  type IssueStatus,
} from "@/lib/domain";
import { isOverdue } from "@/lib/analytics";
import { calendarDate } from "@/lib/format";

export const REPORTS = {
  "open-issues": { title: "Open issues", description: "Every unresolved issue, most urgent first." },
  overdue: { title: "Overdue issues", description: "Unresolved issues past their due date." },
  workload: { title: "Team workload", description: "Unresolved issues per assignee." },
  "project-progress": { title: "Project progress", description: "Completion and backlog per project." },
  resolution: { title: "Issue resolution", description: "Resolved issues and time to resolve." },
} as const;
export type ReportId = keyof typeof REPORTS;
export const isReportId = (id: string): id is ReportId => id in REPORTS;

export interface ReportIssue {
  id: string;
  number: number;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  category: IssueCategory;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  project: { id: string; key: string; name: string } | null;
  assignee: { id: string; full_name: string; email: string } | null;
}

export interface ReportTable {
  columns: string[];
  rows: (string | number | null)[][];
  summary?: string;
}

const priorityRank = (p: IssuePriority) => ISSUE_PRIORITIES.indexOf(p);
const key = (i: ReportIssue) => `${i.project?.key ?? "?"}-${i.number}`;
const person = (i: ReportIssue) => i.assignee?.full_name || i.assignee?.email || "Unassigned";
const daysBetween = (a: string, b: string) =>
  Math.round(((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000) * 10) / 10;

export function buildReport(id: ReportId, issues: ReportIssue[], now = new Date()): ReportTable {
  const today = calendarDate(now);
  switch (id) {
    case "open-issues": {
      const list = issues
        .filter((i) => isUnresolved(i.status))
        .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.created_at.localeCompare(b.created_at));
      return {
        columns: ["Key", "Title", "Project", "Status", "Priority", "Category", "Assignee", "Due date", "Created"],
        rows: list.map((i) => [
          key(i),
          i.title,
          i.project?.name ?? "",
          STATUS_LABELS[i.status],
          PRIORITY_LABELS[i.priority],
          CATEGORY_LABELS[i.category],
          person(i),
          i.due_date,
          calendarDate(i.created_at),
        ]),
        summary: `${list.length} open issue(s)`,
      };
    }
    case "overdue": {
      const list = issues.filter((i) => isOverdue(i, now)).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
      return {
        columns: ["Key", "Title", "Project", "Priority", "Assignee", "Due date", "Days overdue"],
        rows: list.map((i) => [
          key(i),
          i.title,
          i.project?.name ?? "",
          PRIORITY_LABELS[i.priority],
          person(i),
          i.due_date,
          Math.floor(daysBetween(`${i.due_date}T00:00:00Z`, `${today}T00:00:00Z`)),
        ]),
        summary: `${list.length} overdue issue(s)`,
      };
    }
    case "workload": {
      const map = new Map<string, { name: string; open: number; inProgress: number; blocked: number; review: number; overdue: number; critical: number }>();
      for (const i of issues.filter((x) => isUnresolved(x.status))) {
        const name = person(i);
        const row = map.get(name) ?? { name, open: 0, inProgress: 0, blocked: 0, review: 0, overdue: 0, critical: 0 };
        if (i.status === "open") row.open++;
        if (i.status === "in_progress") row.inProgress++;
        if (i.status === "blocked") row.blocked++;
        if (i.status === "in_review") row.review++;
        if (isOverdue(i, now)) row.overdue++;
        if (i.priority === "critical") row.critical++;
        map.set(name, row);
      }
      const rows = [...map.values()].sort((a, b) => b.open + b.inProgress + b.blocked + b.review - (a.open + a.inProgress + a.blocked + a.review));
      return {
        columns: ["Assignee", "Open", "In progress", "Blocked", "In review", "Total unresolved", "Overdue", "Critical"],
        rows: rows.map((r) => [r.name, r.open, r.inProgress, r.blocked, r.review, r.open + r.inProgress + r.blocked + r.review, r.overdue, r.critical]),
        summary: `${rows.length} assignee(s)`,
      };
    }
    case "project-progress": {
      const map = new Map<string, { name: string; key: string; total: number; resolved: number; open: number; blocked: number; overdue: number }>();
      for (const i of issues) {
        if (!i.project) continue;
        const row = map.get(i.project.id) ?? { name: i.project.name, key: i.project.key, total: 0, resolved: 0, open: 0, blocked: 0, overdue: 0 };
        row.total++;
        if (!isUnresolved(i.status)) row.resolved++;
        else row.open++;
        if (i.status === "blocked") row.blocked++;
        if (isOverdue(i, now)) row.overdue++;
        map.set(i.project.id, row);
      }
      const rows = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
      return {
        columns: ["Project", "Key", "Total issues", "Resolved", "Unresolved", "Blocked", "Overdue", "% complete"],
        rows: rows.map((r) => [r.name, r.key, r.total, r.resolved, r.open, r.blocked, r.overdue, r.total ? Math.round((r.resolved / r.total) * 100) : 0]),
        summary: `${rows.length} project(s)`,
      };
    }
    case "resolution": {
      const list = issues
        .filter((i) => i.resolved_at)
        .sort((a, b) => b.resolved_at!.localeCompare(a.resolved_at!));
      const avg = list.length ? list.reduce((s, i) => s + daysBetween(i.created_at, i.resolved_at!), 0) / list.length : 0;
      return {
        columns: ["Key", "Title", "Project", "Priority", "Assignee", "Created", "Resolved", "Days to resolve"],
        rows: list.map((i) => [
          key(i),
          i.title,
          i.project?.name ?? "",
          PRIORITY_LABELS[i.priority],
          person(i),
          calendarDate(i.created_at),
          calendarDate(i.resolved_at!),
          daysBetween(i.created_at, i.resolved_at!),
        ]),
        summary: `${list.length} resolved issue(s), average ${Math.round(avg * 10) / 10} days to resolve`,
      };
    }
  }
}

/** RFC 4180 CSV with protection against spreadsheet formula injection. */
export function toCsv(table: ReportTable): string {
  const cell = (v: string | number | null) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [table.columns, ...table.rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
