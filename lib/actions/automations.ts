"use server";

import { revalidatePath } from "next/cache";
import { assertViewer } from "@/lib/auth";
import { isJobId, runJob } from "@/lib/automation/jobs";
import { createClient } from "@/lib/supabase/server";
import { automationConfigSchema } from "@/lib/validation/schemas";
import { fail, ok, type ActionResult } from "./result";

export async function runAutomationNow(jobId: string): Promise<ActionResult<{ summary: string; status: string }>> {
  try {
    const viewer = await assertViewer(["admin"]);
    if (!isJobId(jobId)) return { ok: false, error: "Unknown automation" };
    const result = await runJob(jobId, "manual", viewer.id);
    revalidatePath("/automations");
    if (result.status === "failed") return { ok: false, error: `Run failed: ${result.summary}` };
    return ok({ summary: result.summary, status: result.status }, result.summary);
  } catch (err) {
    return fail(err);
  }
}

export async function updateAutomation(input: unknown): Promise<ActionResult> {
  try {
    await assertViewer(["admin"]);
    const data = automationConfigSchema.parse(input);
    const supabase = await createClient();
    const { data: job } = await supabase.from("automation_jobs").select("config").eq("id", data.jobId).single();
    if (!job) return { ok: false, error: "Unknown automation" };
    const config = { ...(job.config as Record<string, unknown>) };
    if (data.staleDays !== undefined) config.stale_days = data.staleDays;
    if (data.lookbackHours !== undefined) config.lookback_hours = data.lookbackHours;
    const patch: Record<string, unknown> = { config };
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    const { data: rows, error } = await supabase.from("automation_jobs").update(patch).eq("id", data.jobId).select("id");
    if (error) throw error;
    if (!rows?.length) return { ok: false, error: "Only admins can change automations" };
    revalidatePath("/automations");
    return ok(undefined, "Automation updated");
  } catch (err) {
    return fail(err);
  }
}
