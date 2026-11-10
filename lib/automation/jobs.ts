import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { UNRESOLVED_STATUSES, type IssueStatus } from "@/lib/domain";
import type { AutomationJob } from "@/types/db";

// Scheduled jobs run with the service role (no user session) after the caller has been
// authorised by CRON_SECRET (Vercel Cron) or an admin session ("Run now"). They only READ
// issue data and WRITE to automation_logs/automation_jobs — they never modify issues.

export const JOB_IDS = [
  "daily-overdue-check",
  "weekly-project-summary",
  "stale-issue-detection",
  "import-failure-monitor",
] as const;
export type JobId = (typeof JOB_IDS)[number];

export function isJobId(id: string): id is JobId {
  return (JOB_IDS as readonly string[]).includes(id);
}

interface IssueRow {
  id: string;
  number: number;
  title: string;
  status: IssueStatus;
  priority: string;
  due_date: string | null;
  updated_at: string;
  created_at: string;
  resolved_at: string | null;
  project: { id: string; key: string; name: string; status: string } | null;
  assignee: { full_name: string; email: string } | null;
}

const ISSUE_SELECT =
  "id, number, title, status, priority, due_date, updated_at, created_at, resolved_at, project:projects(id, key, name, status), assignee:profiles!issues_assignee_id_fkey(full_name, email)";

interface JobOutput {
  summary: string;
  result: Record<string, unknown>;
}

const assigneeName = (i: IssueRow) => i.assignee?.full_name || i.assignee?.email || "Unassigned";
const key = (i: IssueRow) => `${i.project?.key ?? "?"}-${i.number}`;

async function dailyOverdue(db: SupabaseClient, now: Date): Promise<JobOutput> {
  const today = now.toISOString().slice(0, 10);
  const { data, error } = await db
    .from("issues")
    .select(ISSUE_SELECT)
    .lt("due_date", today)
    .in("status", UNRESOLVED_STATUSES)
    .order("due_date")
    .returns<IssueRow[]>();
  if (error) throw error;
  const issues = (data ?? []).map((i) => ({
    key: key(i),
    title: i.title,
    project: i.project?.name,
    assignee: assigneeName(i),
    priority: i.priority,
    due_date: i.due_date,
    days_overdue: Math.floor((now.getTime() - new Date(`${i.due_date}T00:00:00Z`).getTime()) / 86_400_000),
  }));
  const byAssignee: Record<string, number> = {};
  for (const i of issues) byAssignee[i.assignee] = (byAssignee[i.assignee] ?? 0) + 1;
  return {
    summary: issues.length ? `${issues.length} overdue issue(s) across ${new Set(issues.map((i) => i.project)).size} project(s)` : "No overdue issues",
    result: { count: issues.length, by_assignee: byAssignee, issues },
  };
}

async function weeklySummary(db: SupabaseClient, now: Date): Promise<JobOutput> {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const { data, error } = await db.from("issues").select(ISSUE_SELECT).returns<IssueRow[]>();
  if (error) throw error;
  const projects: Record<string, { project: string; open: number; in_progress: number; blocked: number; in_review: number; resolved_this_week: number; created_this_week: number; blocked_issues: string[] }> = {};
  for (const i of data ?? []) {
    if (!i.project || i.project.status === "archived") continue;
    const p = (projects[i.project.key] ??= {
      project: i.project.name,
      open: 0,
      in_progress: 0,
      blocked: 0,
      in_review: 0,
      resolved_this_week: 0,
      created_this_week: 0,
      blocked_issues: [],
    });
    if (i.status === "open") p.open++;
    if (i.status === "in_progress") p.in_progress++;
    if (i.status === "in_review") p.in_review++;
    if (i.status === "blocked") {
      p.blocked++;
      p.blocked_issues.push(`${key(i)} ${i.title}`);
    }
    if (i.resolved_at && i.resolved_at >= weekAgo) p.resolved_this_week++;
    if (i.created_at >= weekAgo) p.created_this_week++;
  }
  const list = Object.entries(projects).map(([k, v]) => ({ key: k, ...v }));
  const totals = list.reduce(
    (t, p) => ({ open: t.open + p.open + p.in_progress + p.in_review, blocked: t.blocked + p.blocked, resolved: t.resolved + p.resolved_this_week }),
    { open: 0, blocked: 0, resolved: 0 },
  );
  return {
    summary: `${list.length} project(s): ${totals.open} unresolved, ${totals.blocked} blocked, ${totals.resolved} resolved this week`,
    result: { week_starting: weekAgo.slice(0, 10), totals, projects: list },
  };
}

async function staleIssues(db: SupabaseClient, now: Date, config: Record<string, unknown>): Promise<JobOutput> {
  const days = Number(config.stale_days ?? 7) || 7;
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();
  const { data, error } = await db
    .from("issues")
    .select(ISSUE_SELECT)
    .in("status", UNRESOLVED_STATUSES)
    .lt("updated_at", cutoff)
    .order("updated_at")
    .returns<IssueRow[]>();
  if (error) throw error;
  const issues = (data ?? []).map((i) => ({
    key: key(i),
    title: i.title,
    project: i.project?.name,
    status: i.status,
    assignee: assigneeName(i),
    last_updated: i.updated_at,
    days_idle: Math.floor((now.getTime() - new Date(i.updated_at).getTime()) / 86_400_000),
  }));
  return {
    summary: issues.length ? `${issues.length} issue(s) not updated for ${days}+ days` : `No issues idle for ${days}+ days`,
    result: { stale_days: days, count: issues.length, issues },
  };
}

async function importFailures(db: SupabaseClient, now: Date, config: Record<string, unknown>): Promise<JobOutput> {
  const hours = Number(config.lookback_hours ?? 24) || 24;
  const since = new Date(now.getTime() - hours * 3600_000).toISOString();
  const { data, error } = await db
    .from("imports")
    .select("id, status, error_message, file_names, updated_at, project:projects(key, name), creator:profiles!imports_created_by_fkey(full_name, email)")
    .eq("status", "failed")
    .gte("updated_at", since)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const failures = (data ?? []).map((i) => {
    const project = i.project as unknown as { key: string; name: string } | null;
    const creator = i.creator as unknown as { full_name: string; email: string } | null;
    return {
      import_id: i.id,
      project: project?.name,
      files: i.file_names,
      error: i.error_message,
      by: creator?.full_name || creator?.email,
      at: i.updated_at,
    };
  });
  return {
    summary: failures.length ? `${failures.length} failed import(s) in the last ${hours}h` : `No failed imports in the last ${hours}h`,
    result: { lookback_hours: hours, count: failures.length, failures },
  };
}

export interface RunResult {
  logId: string;
  status: "success" | "failed" | "skipped";
  summary: string;
}

export async function runJob(jobId: JobId, trigger: "cron" | "manual", triggeredBy: string | null = null): Promise<RunResult> {
  const db = createAdminClient();
  const { data: job, error: jobError } = await db.from("automation_jobs").select("*").eq("id", jobId).single<AutomationJob>();
  if (jobError || !job) throw new Error(`Automation job ${jobId} is not installed (run migrations)`);

  if (!job.enabled && trigger === "cron") {
    return { logId: "", status: "skipped", summary: "Job is disabled" };
  }

  const startedAt = new Date();
  const { data: log, error: logError } = await db
    .from("automation_logs")
    .insert({ job_id: jobId, trigger, triggered_by: triggeredBy, status: "running", started_at: startedAt.toISOString() })
    .select("id")
    .single();
  if (logError) throw logError;

  try {
    const output =
      jobId === "daily-overdue-check"
        ? await dailyOverdue(db, startedAt)
        : jobId === "weekly-project-summary"
          ? await weeklySummary(db, startedAt)
          : jobId === "stale-issue-detection"
            ? await staleIssues(db, startedAt, job.config)
            : await importFailures(db, startedAt, job.config);

    const finishedAt = new Date().toISOString();
    await db
      .from("automation_logs")
      .update({ status: "success", finished_at: finishedAt, summary: output.summary, result: output.result })
      .eq("id", log.id);
    await db.from("automation_jobs").update({ last_run_at: finishedAt, last_status: "success" }).eq("id", jobId);
    return { logId: log.id, status: "success", summary: output.summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const finishedAt = new Date().toISOString();
    await db
      .from("automation_logs")
      .update({ status: "failed", finished_at: finishedAt, error: message.slice(0, 1000) })
      .eq("id", log.id);
    await db.from("automation_jobs").update({ last_run_at: finishedAt, last_status: "failed" }).eq("id", jobId);
    return { logId: log.id, status: "failed", summary: message };
  }
}
