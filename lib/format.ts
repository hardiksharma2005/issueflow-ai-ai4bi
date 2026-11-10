import { format, formatDistanceToNowStrict } from "date-fns";

export function formatDate(value: string | Date | null | undefined, pattern = "d MMM yyyy") {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00` : value) : value;
  return Number.isNaN(d.getTime()) ? "—" : format(d, pattern);
}

export function formatDateTime(value: string | null | undefined) {
  return formatDate(value, "d MMM yyyy, HH:mm");
}

export function timeAgo(value: string | null | undefined) {
  if (!value) return "—";
  return `${formatDistanceToNowStrict(new Date(value))} ago`;
}

/** ISO timestamp `days` ago (request-time value for server queries). */
export function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function initials(name: string | null | undefined) {
  const parts = (name ?? "?").trim().split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function displayName(p: { full_name?: string | null; email?: string | null } | null | undefined) {
  return p?.full_name || p?.email || "Unassigned";
}
