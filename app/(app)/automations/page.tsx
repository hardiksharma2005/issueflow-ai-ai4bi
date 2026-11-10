import type { Metadata } from "next";
import { CalendarClock, CheckCircle2, Info, XCircle } from "lucide-react";
import { EnabledSwitch, NumberSetting, RunNowButton } from "@/components/automations/automation-controls";
import { PageHeader } from "@/components/shared/page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireViewer } from "@/lib/auth";
import { describeCron, nextRun } from "@/lib/automation/cron";
import { formatDateTime, timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { AutomationJob, AutomationLog } from "@/types/db";

export const metadata: Metadata = { title: "Automations" };

function ResultPreview({ log }: { log: AutomationLog }) {
  const r = log.result as Record<string, unknown>;
  const items = (r.issues ?? r.failures ?? r.projects) as Record<string, unknown>[] | undefined;
  if (!items?.length) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-primary">View report ({items.length})</summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              {Object.keys(items[0])
                .filter((k) => typeof items[0][k] !== "object")
                .map((k) => (
                  <th key={k} className="px-2 py-1 text-left font-medium capitalize">
                    {k.replace(/_/g, " ")}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {items.map((row, i) => (
              <tr key={i} className="border-t">
                {Object.entries(row)
                  .filter(([, v]) => typeof v !== "object" || v === null)
                  .map(([k, v]) => (
                    <td key={k} className="px-2 py-1">
                      {String(v ?? "—")}
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default async function AutomationsPage() {
  const viewer = await requireViewer();
  const isAdmin = viewer.profile.role === "admin";
  const supabase = await createClient();
  const [{ data: jobs }, { data: logs }] = await Promise.all([
    supabase.from("automation_jobs").select("*").order("schedule").returns<AutomationJob[]>(),
    isAdmin
      ? supabase.from("automation_logs").select("*").order("started_at", { ascending: false }).limit(60).returns<AutomationLog[]>()
      : Promise.resolve({ data: [] as AutomationLog[] }),
  ]);
  const cronConfigured = Boolean(process.env.CRON_SECRET);

  return (
    <div className="grid gap-5">
      <PageHeader title="Automations" description="Scheduled jobs that watch for overdue, stale and failed work. Schedules run in UTC via Vercel Cron." />
      <Alert>
        <Info aria-hidden />
        <AlertTitle>{cronConfigured ? "Cron endpoint secured" : "CRON_SECRET not set in this environment"}</AlertTitle>
        <AlertDescription>
          {cronConfigured
            ? "Scheduled runs require the CRON_SECRET bearer token. On the Vercel Hobby plan each job runs once a day and may start up to 59 minutes after its scheduled time."
            : "Scheduled runs are disabled until CRON_SECRET is configured (see docs/09-automation.md). Admins can still use “Run now”."}
        </AlertDescription>
      </Alert>
      {!isAdmin && <p className="text-sm text-muted-foreground">Only admins can run automations and view their reports.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {(jobs ?? []).map((job) => {
          const jobLogs = (logs ?? []).filter((l) => l.job_id === job.id);
          const next = job.enabled ? nextRun(job.schedule) : null;
          return (
            <section key={job.id} className="flex flex-col rounded-xl border bg-card">
              <div className="flex items-start justify-between gap-3 border-b p-4">
                <div className="min-w-0">
                  <h2 className="font-medium">{job.name}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">{job.description}</p>
                </div>
                {isAdmin ? <EnabledSwitch jobId={job.id} enabled={job.enabled} /> : <span className="text-xs text-muted-foreground">{job.enabled ? "Enabled" : "Paused"}</span>}
              </div>
              <dl className="grid grid-cols-2 gap-3 p-4 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Schedule</dt>
                  <dd className="mt-0.5 flex items-center gap-1">
                    <CalendarClock className="size-3.5" aria-hidden /> {describeCron(job.schedule)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last run</dt>
                  <dd className="mt-0.5">{job.last_run_at ? timeAgo(job.last_run_at) : "Never"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Next run</dt>
                  <dd className="mt-0.5">{next ? formatDateTime(next.toISOString()) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="mt-0.5 flex items-center gap-1">
                    {job.last_status === "success" && <CheckCircle2 className="size-3.5 text-[var(--status-resolved)]" aria-hidden />}
                    {job.last_status === "failed" && <XCircle className="size-3.5 text-destructive" aria-hidden />}
                    {job.last_status ? (job.last_status === "success" ? "Succeeded" : job.last_status === "failed" ? "Failed" : "Running") : "—"}
                  </dd>
                </div>
              </dl>
              {isAdmin && (
                <div className="flex flex-wrap items-end justify-between gap-3 border-t px-4 py-3">
                  {job.id === "stale-issue-detection" ? (
                    <NumberSetting jobId={job.id} field="staleDays" label="Stale after (days)" value={Number(job.config.stale_days ?? 7)} min={1} max={365} />
                  ) : job.id === "import-failure-monitor" ? (
                    <NumberSetting jobId={job.id} field="lookbackHours" label="Look back (hours)" value={Number(job.config.lookback_hours ?? 24)} min={1} max={720} />
                  ) : (
                    <span />
                  )}
                  <RunNowButton jobId={job.id} />
                </div>
              )}
              {isAdmin && (
                <div className="border-t px-4 py-3">
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">Execution history</h3>
                  {jobLogs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No runs yet.</p>
                  ) : (
                    <ul className="grid gap-2">
                      {jobLogs.slice(0, 5).map((log) => (
                        <li key={log.id} className="text-xs">
                          <div className="flex items-center gap-2">
                            {log.status === "success" ? (
                              <CheckCircle2 className="size-3.5 shrink-0 text-[var(--status-resolved)]" aria-label="Succeeded" />
                            ) : (
                              <XCircle className="size-3.5 shrink-0 text-destructive" aria-label="Failed" />
                            )}
                            <span className="min-w-0 flex-1 truncate">{log.summary ?? log.error ?? log.status}</span>
                            <span className="shrink-0 text-muted-foreground">
                              {log.trigger === "cron" ? "Scheduled" : "Manual"} · {timeAgo(log.started_at)}
                            </span>
                          </div>
                          <ResultPreview log={log} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
