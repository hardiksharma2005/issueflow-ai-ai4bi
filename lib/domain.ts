// Shared domain vocabulary. Values mirror the Postgres enums in database/migrations/0001_schema.sql.

export const ROLES = ["admin", "manager", "member"] as const;
export type Role = (typeof ROLES)[number];

export const ISSUE_STATUSES = ["open", "in_progress", "blocked", "in_review", "resolved", "closed"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export const ISSUE_CATEGORIES = [
  "bug",
  "feature_request",
  "performance",
  "ui_ux",
  "maintenance",
  "customer_complaint",
  "operations",
  "other",
] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export const PROJECT_STATUSES = ["active", "on_hold", "completed", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const IMPORT_STATUSES = [
  "uploaded",
  "parsing",
  "parsed",
  "processing",
  "review",
  "completed",
  "failed",
  "duplicate",
] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const DRAFT_STATUSES = ["pending", "approved", "rejected", "merged"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const STATUS_LABELS: Record<IssueStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  blocked: "Blocked",
  in_review: "In Review",
  resolved: "Resolved",
  closed: "Closed",
};

export const PRIORITY_LABELS: Record<IssuePriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const CATEGORY_LABELS: Record<IssueCategory, string> = {
  bug: "Bug",
  feature_request: "Feature request",
  performance: "Performance",
  ui_ux: "UI/UX",
  maintenance: "Maintenance",
  customer_complaint: "Customer complaint",
  operations: "Operations",
  other: "Other",
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  member: "Member",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
};

export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  uploaded: "Uploaded",
  parsing: "Parsing",
  parsed: "Parsed",
  processing: "Processing",
  review: "Needs review",
  completed: "Completed",
  failed: "Failed",
  duplicate: "Duplicate",
};

/** CSS custom properties defined in app/globals.css */
export const STATUS_COLOR_VAR: Record<IssueStatus, string> = {
  open: "var(--status-open)",
  in_progress: "var(--status-progress)",
  blocked: "var(--status-blocked)",
  in_review: "var(--status-review)",
  resolved: "var(--status-resolved)",
  closed: "var(--status-closed)",
};

export const PRIORITY_COLOR_VAR: Record<IssuePriority, string> = {
  critical: "var(--priority-critical)",
  high: "var(--priority-high)",
  medium: "var(--priority-medium)",
  low: "var(--priority-low)",
};

export const UNRESOLVED_STATUSES: IssueStatus[] = ["open", "in_progress", "blocked", "in_review"];

export function isUnresolved(status: IssueStatus) {
  return UNRESOLVED_STATUSES.includes(status);
}

export function issueKey(projectKey: string, number: number) {
  return `${projectKey}-${number}`;
}
