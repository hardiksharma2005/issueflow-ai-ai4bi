"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MAX_IMPORT_FILES, MAX_IMPORT_TOTAL_BYTES, checkFile, sanitizeFileName } from "@/lib/validation/files";
import { uuid } from "@/lib/validation/schemas";
import { fail, ok, type ActionResult } from "./result";

const createImportSchema = z.object({
  projectId: uuid,
  files: z
    .array(z.object({ name: z.string().min(1).max(255), size: z.number().int().nonnegative() }))
    .min(1, "Select at least one file")
    .max(MAX_IMPORT_FILES, `Upload at most ${MAX_IMPORT_FILES} files at once`),
});

/** Step 1–2 of the wizard: create the import record and tell the browser where to upload. */
export async function createImport(
  input: unknown,
): Promise<ActionResult<{ importId: string; uploads: { name: string; path: string }[] }>> {
  try {
    const viewer = await assertViewer(["admin", "manager"]);
    const data = createImportSchema.parse(input);

    const errors = data.files.map((f) => checkFile(f.name, f.size)).filter((c) => !c.ok);
    if (errors.length) return { ok: false, error: errors.map((e) => e.error).join("; ") };
    const total = data.files.reduce((s, f) => s + f.size, 0);
    if (total > MAX_IMPORT_TOTAL_BYTES) return { ok: false, error: "Files exceed 100 MB in total" };

    const supabase = await createClient();
    const names = new Set<string>();
    const uploads = data.files.map((f) => {
      let safe = sanitizeFileName(f.name);
      while (names.has(safe)) safe = `1_${safe}`;
      names.add(safe);
      return { name: f.name, safe };
    });

    const { data: row, error } = await supabase
      .from("imports")
      .insert({ project_id: data.projectId, created_by: viewer.id, file_names: uploads.map((u) => u.name) })
      .select("id")
      .single();
    if (error) throw error;

    return ok({
      importId: row.id,
      uploads: uploads.map((u) => ({ name: u.name, path: `${data.projectId}/imports/${row.id}/raw/${u.safe}` })),
    });
  } catch (err) {
    return fail(err);
  }
}

export async function deleteImport(importId: string): Promise<ActionResult> {
  try {
    await assertViewer(["admin", "manager"]);
    const id = uuid.parse(importId);
    const supabase = await createClient();
    const { data: imp } = await supabase.from("imports").select("id, project_id").eq("id", id).single();
    if (!imp) return { ok: false, error: "Import not found" };

    // Approved issues keep their evidence: only remove files not linked to an issue.
    const { data: files } = await supabase
      .from("attachments")
      .select("storage_path")
      .eq("import_id", id)
      .is("issue_id", null);
    const raw = await supabase.storage.from("evidence").list(`${imp.project_id}/imports/${id}/raw`);
    const paths = [
      ...(files ?? []).map((f) => f.storage_path),
      ...(raw.data ?? []).map((o) => `${imp.project_id}/imports/${id}/raw/${o.name}`),
    ];
    // Keep linked attachments by detaching them from the import before the cascade.
    await supabase.from("attachments").update({ import_id: null }).eq("import_id", id).not("issue_id", "is", null);

    const { data: rows, error } = await supabase.from("imports").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!rows?.length) return { ok: false, error: "You do not have permission to delete this import" };
    if (paths.length) await supabase.storage.from("evidence").remove(paths);
    revalidatePath("/imports");
    return ok(undefined, "Import deleted");
  } catch (err) {
    return fail(err);
  }
}
