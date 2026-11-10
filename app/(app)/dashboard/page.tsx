import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDot, Clock, Flame, FolderKanban, ListTodo, Upload } from "lucide-react";
import { BreakdownChart, ResolutionChart, TimelineChart } from "@/components/dashboard/charts";
import { PriorityIcon, StatusBadge } from "@/components/shared/badges";
import { EmptyState, PageHeader, Section } from "@/components/shared/page";
import { ProjectFilter } from "@/components/shared/project-filter";
import { Button } from "@/components/ui/button";
import { computeDashboard, isOverdue } from "@/lib/analytics";
import { requireViewer } from "@/lib/auth";
import { CATEGORY_LABELS, ISSUE_CATEGORIES, ISSUE_PRIORITIES, ISSUE_STATUSES, PRIORITY_LABELS, STATUS_LABELS } from "@/lib/domain";
import { formatDate, timeAgo } from "@/lib/format";
import { fetchIssuesForReports } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Overview" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const viewer = await requireViewer();
  const params = await searchParams;
  const supabase = await createClient();
  const { data: projects } = await supabase.from("projects").select("id, name").order("name");
  const projectId = typeof params.project === "string" && projects?.some((p) => p.id === params.project) ? params.project : undefined;

  const [issues, recentImports] = await Promise.all([
    fetchIssuesForReports(supabase, projectId),
    supabase
      .from("imports")
      .select("id, status, draft_count, message_count, created_at, project:projects(name)")
      .order("created_at", { ascending: false })
      .limit(4),
  ]);
  const now = new Date();
  const d = computeDashboard(issues as never, now);

  const firstName = (viewer.profile.full_name || viewer.email).split(" ")[0];
  const urgent = issues
    .filter((i) => (i.priority === "critical" || isOverdue(i, now)) && !["resolved", "closed"].includes(i.status))
    .slice(0, 6);

  const stats = [
    { label: "Projects", value: projectId ? 1 : (projects?.length ?? 0), icon: FolderKanban, href: "/projects" },
    { label: "Total issues", value: d.counts.total, icon: ListTodo, href: "/issues" },
    { label: "Open", value: d.counts.open, icon: CircleDot, href: "/issues?status=open" },
    { label: "In progress", value: d.counts.inProgress, icon: Clock, href: "/issues?status=in_progress" },
    { label: "Resolved", value: d.counts.resolved, icon: CheckCircle2, href: "/issues?status=resolved" },
    { label: "Overdue", value: d.counts.overdue, icon: AlertTriangle, href: "/reports?report=overdue", alert: d.counts.overdue > 0 },
    { label: "Critical", value: d.counts.critical, icon: Flame, href: "/issues?priority=critical", alert: d.counts.critical > 0 },
  ];

  return (
    <div className="grid gap-6">
      {params.password === "updated" && (
        <div className="rounded-lg border bg-muted/40 px-4 py-2 text-sm">Your password has been updated.</div>
      )}
      <PageHeader
        title={`Good to see you, ${firstName}`}
        description="Live numbers from every project you can access."
        actions={<ProjectFilter projects={projects ?? []} />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="group rounded-xl border bg-card p-3 transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {s.label}
              <s.icon className={s.alert ? "size-3.5 text-destructive" : "size-3.5"} aria-hidden />
            </div>
            <div className="mt-1.5 text-2xl font-semibold tracking-tight">{s.value}</div>
          </Link>
        ))}
      </div>

      {issues.length === 0 ? (
        <EmptyState
          icon={Upload}
          title="No issues yet"
          description="Import a WhatsApp conversation or create an issue to see analytics here."
          action={
            <Button asChild>
              <Link href="/imports/new">Import a conversation</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <TimelineChart data={d.timeline} />
            <ResolutionChart data={d.resolutionTrend} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <BreakdownChart title="Issues by status" description="All issues" data={ISSUE_STATUSES.map((s) => ({ label: STATUS_LABELS[s], value: d.byStatus[s] }))} />
            <BreakdownChart title="Issues by priority" description="Unresolved issues" data={ISSUE_PRIORITIES.map((p) => ({ label: PRIORITY_LABELS[p], value: d.byPriority[p] }))} />
            <BreakdownChart title="Issues by category" description="All issues" data={ISSUE_CATEGORIES.map((c) => ({ label: CATEGORY_LABELS[c], value: d.byCategory[c] }))} />
          </div>
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Section title="Needs attention" description="Critical or overdue and still unresolved">
          {urgent.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nothing urgent right now.</p>
          ) : (
            <ul className="-my-2 divide-y">
              {urgent.map((i) => (
                <li key={i.id}>
                  <Link href={`/issues/${i.id}`} className="flex items-center gap-3 py-2 text-sm hover:text-primary">
                    <PriorityIcon priority={i.priority} />
                    <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{i.project?.key}-{i.number}</span>
                    <span className="min-w-0 flex-1 truncate">{i.title}</span>
                    {isOverdue(i, now) && <span className="shrink-0 text-xs text-destructive">Due {formatDate(i.due_date, "d MMM")}</span>}
                    <StatusBadge status={i.status} className="hidden sm:inline-flex" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section
          title="Recent imports"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link href="/imports">View all</Link>
            </Button>
          }
        >
          {(recentImports.data ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No imports yet.</p>
          ) : (
            <ul className="-my-2 divide-y">
              {(recentImports.data ?? []).map((imp) => (
                <li key={imp.id}>
                  <Link href={`/imports/${imp.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-primary">
                    <span className="min-w-0">
                      <span className="block truncate">{(imp.project as unknown as { name: string } | null)?.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {imp.message_count} messages · {imp.draft_count} drafts · {timeAgo(imp.created_at)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground capitalize">{imp.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
