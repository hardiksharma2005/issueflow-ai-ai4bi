import { formatDistanceToNowStrict } from "date-fns";

/**
 * Time zone used to display timestamps — the same on the server (UTC on Vercel) and in the
 * browser, so server-rendered and hydrated text always match. Override per deployment.
 */
export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata";

type Pattern = "d MMM yyyy" | "d MMM";
const PATTERNS: Record<Pattern | "datetime", Intl.DateTimeFormatOptions> = {
  "d MMM yyyy": { day: "numeric", month: "short", year: "numeric" },
  "d MMM": { day: "numeric", month: "short" },
  datetime: { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
};
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(pattern: keyof typeof PATTERNS, timeZone: string) {
  const id = `${pattern}|${timeZone}`;
  let f = formatters.get(id);
  if (!f) formatters.set(id, (f = new Intl.DateTimeFormat("en-GB", { ...PATTERNS[pattern], timeZone })));
  return f;
}

function render(value: string | Date | null | undefined, pattern: keyof typeof PATTERNS) {
  if (!value) return "—";
  // Date-only values (due dates, chart days) are calendar dates: never shift them by a time zone.
  const dateOnly = typeof value === "string" && value.length === 10;
  const d = typeof value === "string" ? new Date(dateOnly ? `${value}T00:00:00Z` : value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return formatter(pattern, dateOnly ? "UTC" : APP_TIMEZONE).format(d);
}

const isoDay = new Map<string, Intl.DateTimeFormat>();
/** Calendar date (YYYY-MM-DD) of a moment in the app time zone — for "today", overdue checks and day buckets. */
export function calendarDate(value: Date | string = new Date(), timeZone = APP_TIMEZONE) {
  let f = isoDay.get(timeZone);
  if (!f) isoDay.set(timeZone, (f = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone })));
  return f.format(typeof value === "string" ? new Date(value) : value);
}

export function formatDate(value: string | Date | null | undefined, pattern: Pattern = "d MMM yyyy") {
  return render(value, pattern);
}

export function formatDateTime(value: string | null | undefined) {
  return render(value, "datetime");
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
