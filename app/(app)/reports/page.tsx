import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/shared/page";
import { ProjectFilter } from "@/components/shared/project-filter";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireViewer } from "@/lib/auth";
import { fetchIssuesForReports } from "@/lib/queries";
import { REPORTS, buildReport, isReportId, type ReportId } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  await requireViewer();
  const sp = await searchParams;
  const report: ReportId = typeof sp.report === "string" && isReportId(sp.report) ? sp.report : "open-issues";
  const supabase = await createClient();
  const { data: projects } = await supabase.from("projects").select("id, name").order("name");
  const projectId = typeof sp.project === "string" && projects?.some((p) => p.id === sp.project) ? sp.project : undefined;
  const issues = await fetchIssuesForReports(supabase, projectId);
  const table = buildReport(report, issues);
  const csvHref = `/api/reports/${report}${projectId ? `?project=${projectId}` : ""}`;
  const numeric = table.rows[0]?.map((v) => typeof v === "number") ?? [];

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Reports"
        description="Generated live from the issues you can access. Export any report as CSV."
        actions={
          <>
            <ProjectFilter projects={projects ?? []} />
            <Button asChild variant="outline">
              <a href={csvHref} download>
                <Download /> Export CSV
              </a>
            </Button>
          </>
        }
      />
      <nav className="flex flex-wrap gap-2" aria-label="Reports">
        {(Object.keys(REPORTS) as ReportId[]).map((id) => (
          <Link
            key={id}
            href={`/reports?report=${id}${projectId ? `&project=${projectId}` : ""}`}
            aria-current={id === report ? "page" : undefined}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm transition-colors",
              id === report ? "border-primary/40 bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {REPORTS[id].title}
          </Link>
        ))}
      </nav>
      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-medium">{REPORTS[report].title}</h2>
            <p className="text-xs text-muted-foreground">{REPORTS[report].description}</p>
          </div>
          <span className="text-xs text-muted-foreground">{table.summary}</span>
        </div>
        {table.rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing to report.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {table.columns.map((c, i) => (
                  <TableHead key={c} className={cn(numeric[i] && "text-right")}>
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.map((row, r) => (
                <TableRow key={r}>
                  {row.map((v, i) => (
                    <TableCell key={i} className={cn(numeric[i] && "text-right tabular-nums", i === 0 && "font-medium", typeof v === "string" && v.length > 40 && "max-w-80 truncate")}>
                      {v ?? "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
