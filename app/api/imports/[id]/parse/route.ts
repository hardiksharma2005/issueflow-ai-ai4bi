import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, assertViewer } from "@/lib/auth";
import { ImportError, parseImport } from "@/lib/imports/pipeline";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({ timezoneOffsetMinutes: z.number().int().min(-840).max(840).default(0) });

export async function POST(request: Request, ctx: RouteContext<"/api/imports/[id]/parse">) {
  try {
    const viewer = await assertViewer(["admin", "manager"]);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid import id" }, { status: 400 });
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const supabase = await createClient();
    const result = await parseImport(supabase, id, viewer.id, body.timezoneOffsetMinutes);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof ImportError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("[parse route]", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
