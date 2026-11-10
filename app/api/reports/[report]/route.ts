import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, assertViewer } from "@/lib/auth";
import { fetchIssuesForReports } from "@/lib/queries";
import { buildReport, isReportId, toCsv } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/api/reports/[report]">) {
  try {
    await assertViewer();
    const { report } = await ctx.params;
    if (!isReportId(report)) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
    const projectParam = new URL(request.url).searchParams.get("project");
    const project = projectParam && z.uuid().safeParse(projectParam).success ? projectParam : undefined;

    const supabase = await createClient();
    const issues = await fetchIssuesForReports(supabase, project);
    const csv = toCsv(buildReport(report, issues));
    await supabase.rpc("log_audit_event", {
      p_action: "report.export",
      p_details: { report, project_id: project ?? null, rows: csv.split("\r\n").length - 2 },
    });
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="issueflow-${report}-${date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[report csv]", err);
    return NextResponse.json({ error: "Could not build the report" }, { status: 500 });
  }
}
