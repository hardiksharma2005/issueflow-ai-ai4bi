"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { commentSchema, issueCreateSchema, issueUpdateSchema, uuid } from "@/lib/validation/schemas";
import { checkFile, sniffMatches } from "@/lib/validation/files";
import { fail, ok, type ActionResult } from "./result";

export async function createIssue(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const viewer = await assertViewer();
    const data = issueCreateSchema.parse(input);
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("issues")
      .insert({
        project_id: data.projectId,
        title: data.title,
        description: data.description,
        category: data.category,
        priority: data.priority,
        status: data.status,
        assignee_id: data.assigneeId,
        due_date: data.dueDate,
        reporter_id: viewer.id,
        reporter_name: data.reporterName,
        created_by: viewer.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    revalidatePath("/issues");
    return ok({ id: row.id }, "Issue created");
  } catch (err) {
    return fail(err);
  }
}

export async function updateIssue(input: unknown): Promise<ActionResult> {
  try {
    await assertViewer();
    const data = issueUpdateSchema.parse(input);
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.category !== undefined) patch.category = data.category;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.status !== undefined) patch.status = data.status;
    if ("assigneeId" in (input as object)) patch.assignee_id = data.assigneeId;
    if ("dueDate" in (input as object)) patch.due_date = data.dueDate;
    if (Object.keys(patch).length === 0) return ok(undefined);

    const supabase = await createClient();
    const { data: rows, error } = await supabase.from("issues").update(patch).eq("id", data.id).select("id");
    if (error) throw error;
    // RLS hides rows the user may not update, so zero rows means "not allowed".
    if (!rows?.length) return { ok: false, error: "You can only update issues assigned to you" };
    revalidatePath(`/issues/${data.id}`);
    return ok(undefined, "Issue updated");
  } catch (err) {
    return fail(err);
  }
}

export async function deleteIssue(issueId: string): Promise<ActionResult> {
  try {
    await assertViewer(["admin", "manager"]);
    const id = uuid.parse(issueId);
    const supabase = await createClient();
    const { data: files } = await supabase.from("attachments").select("storage_path").eq("issue_id", id);
    const { data: rows, error } = await supabase.from("issues").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!rows?.length) return { ok: false, error: "You do not have permission to delete this issue" };
    if (files?.length) await supabase.storage.from("evidence").remove(files.map((f) => f.storage_path));
    revalidatePath("/issues");
    return ok(undefined, "Issue deleted");
  } catch (err) {
    return fail(err);
  }
}

export async function addComment(input: unknown): Promise<ActionResult> {
  try {
    const viewer = await assertViewer();
    const data = commentSchema.parse(input);
    const supabase = await createClient();
    const { error } = await supabase.from("comments").insert({ issue_id: data.issueId, author_id: viewer.id, body: data.body });
    if (error) throw error;
    revalidatePath(`/issues/${data.issueId}`);
    return ok(undefined, "Comment added");
  } catch (err) {
    return fail(err);
  }
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  try {
    await assertViewer();
    const id = uuid.parse(commentId);
    const supabase = await createClient();
    const { data: rows, error } = await supabase.from("comments").delete().eq("id", id).select("issue_id");
    if (error) throw error;
    if (!rows?.length) return { ok: false, error: "You can only delete your own comments" };
    revalidatePath(`/issues/${rows[0].issue_id}`);
    return ok(undefined, "Comment deleted");
  } catch (err) {
    return fail(err);
  }
}

const registerSchema = z.object({
  projectId: uuid,
  issueId: uuid,
  storagePath: z.string().min(10).max(500),
  fileName: z.string().min(1).max(255),
});

/**
 * The browser uploads the file directly to private storage (RLS-protected path),
 * then calls this to verify the content and record it. Invalid files are deleted.
 */
export async function registerIssueAttachment(input: unknown): Promise<ActionResult> {
  try {
    const viewer = await assertViewer();
    const data = registerSchema.parse(input);
    const prefix = `${data.projectId}/issues/${data.issueId}/`;
    if (!data.storagePath.startsWith(prefix) || data.storagePath.includes("..")) {
      return { ok: false, error: "Invalid upload path" };
    }
    const supabase = await createClient();
    const { data: blob, error: dlError } = await supabase.storage.from("evidence").download(data.storagePath);
    if (dlError || !blob) return { ok: false, error: "Upload not found" };

    const check = checkFile(data.fileName, blob.size);
    const bytes = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
    if (!check.ok || !check.info || !sniffMatches(bytes, check.info)) {
      await supabase.storage.from("evidence").remove([data.storagePath]);
      return { ok: false, error: check.error ?? "File content does not match its type" };
    }

    const { error } = await supabase.from("attachments").insert({
      project_id: data.projectId,
      issue_id: data.issueId,
      storage_path: data.storagePath,
      file_name: data.fileName,
      mime_type: check.info.mime,
      size_bytes: blob.size,
      uploaded_by: viewer.id,
    });
    if (error) {
      await supabase.storage.from("evidence").remove([data.storagePath]);
      throw error;
    }
    revalidatePath(`/issues/${data.issueId}`);
    return ok(undefined, "Attachment uploaded");
  } catch (err) {
    return fail(err);
  }
}

export async function deleteAttachment(attachmentId: string): Promise<ActionResult> {
  try {
    await assertViewer();
    const id = uuid.parse(attachmentId);
    const supabase = await createClient();
    const { data: rows, error } = await supabase
      .from("attachments")
      .delete()
      .eq("id", id)
      .select("storage_path, issue_id");
    if (error) throw error;
    if (!rows?.length) return { ok: false, error: "You do not have permission to delete this file" };
    await supabase.storage.from("evidence").remove([rows[0].storage_path]);
    if (rows[0].issue_id) revalidatePath(`/issues/${rows[0].issue_id}`);
    return ok(undefined, "Attachment removed");
  } catch (err) {
    return fail(err);
  }
}
