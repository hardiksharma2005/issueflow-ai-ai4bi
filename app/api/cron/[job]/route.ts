import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isJobId, runJob } from "@/lib/automation/jobs";

// Invoked by Vercel Cron (see vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET"
// when the CRON_SECRET environment variable is set on the project.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request, ctx: RouteContext<"/api/cron/[job]">) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { job } = await ctx.params;
  if (!isJobId(job)) return NextResponse.json({ error: "Unknown job" }, { status: 404 });

  try {
    const result = await runJob(job, "cron");
    return NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
  } catch (err) {
    console.error("[cron]", err);
    return NextResponse.json({ error: "Job could not be started" }, { status: 500 });
  }
}
