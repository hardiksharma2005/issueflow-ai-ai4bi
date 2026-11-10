import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, assertViewer } from "@/lib/auth";
import { ImportError, processImport } from "@/lib/imports/pipeline";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(_request: Request, ctx: RouteContext<"/api/imports/[id]/process">) {
  try {
    const viewer = await assertViewer(["admin", "manager"]);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid import id" }, { status: 400 });
    const supabase = await createClient();
    const result = await processImport(supabase, id, viewer.id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof ImportError) return NextResponse.json({ error: err.message }, { status: 422 });
    if (err instanceof Error && err.message.includes("XAI_API_KEY")) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[process route]", err);
    return NextResponse.json({ error: "AI processing failed" }, { status: 500 });
  }
}
