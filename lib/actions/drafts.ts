"use server";

import { revalidatePath } from "next/cache";
import { assertViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { draftApproveSchema, draftEvidenceSchema, uuid } from "@/lib/validation/schemas";
import { fail, ok, type ActionResult } from "./result";

// Human review of AI drafts. Every operation is a SECURITY INVOKER database function,
// so RLS + the can_manage_project check apply, and each runs in a single transaction.

export async function approveDraft(input: unknown): Promise<ActionResult<{ issueId: string }>> {
  try {
    await assertViewer(["admin", "manager"]);
    const d = draftApproveSchema.parse(input);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("approve_issue_draft", {
      p_draft_id: d.draftId,
      p_title: d.title,
      p_description: d.description,
      p_category: d.category,
      p_priority: d.priority,
      p_assignee_id: d.assigneeId,
      p_due_date: d.dueDate,
    });
    if (error) throw error;
    revalidatePath("/imports", "layout");
    return ok({ issueId: data as string }, "Issue created from draft");
  } catch (err) {
    return fail(err);
  }
}

export async function rejectDraft(draftId: string): Promise<ActionResult> {
  try {
    await assertViewer(["admin", "manager"]);
    const supabase = await createClient();
    const { error } = await supabase.rpc("reject_issue_draft", { p_draft_id: uuid.parse(draftId) });
    if (error) throw error;
    revalidatePath("/imports", "layout");
    return ok(undefined, "Draft rejected");
  } catch (err) {
    return fail(err);
  }
}

export async function mergeDraftIntoIssue(draftId: string, issueId: string): Promise<ActionResult> {
  try {
    await assertViewer(["admin", "manager"]);
    const supabase = await createClient();
    const { error } = await supabase.rpc("merge_draft_into_issue", {
      p_draft_id: uuid.parse(draftId),
      p_issue_id: uuid.parse(issueId),
    });
    if (error) throw error;
    revalidatePath("/imports", "layout");
    return ok(undefined, "Linked to the existing issue");
  } catch (err) {
    return fail(err);
  }
}

export async function mergeDrafts(keepId: string, mergeId: string): Promise<ActionResult> {
  try {
    await assertViewer(["admin", "manager"]);
    const supabase = await createClient();
    const { error } = await supabase.rpc("merge_drafts", {
      p_keep_id: uuid.parse(keepId),
      p_merge_id: uuid.parse(mergeId),
    });
    if (error) throw error;
    revalidatePath("/imports", "layout");
    return ok(undefined, "Drafts merged");
  } catch (err) {
    return fail(err);
  }
}

/** Add or remove evidence (messages / attachments) on a pending draft. */
export async function updateDraftEvidence(input: unknown): Promise<ActionResult> {
  try {
    await assertViewer(["admin", "manager"]);
    const d = draftEvidenceSchema.parse(input);
    const supabase = await createClient();
    const { data: draft } = await supabase
      .from("issue_drafts")
      .select("id, import_id, status")
      .eq("id", d.draftId)
      .single();
    if (!draft) return { ok: false, error: "Draft not found" };
    if (draft.status !== "pending") return { ok: false, error: "This draft has already been reviewed" };

    // Evidence must come from the same import.
    const [{ data: atts }, { data: msgs }] = await Promise.all([
      d.attachmentIds.length
        ? supabase.from("attachments").select("id").eq("import_id", draft.import_id).in("id", d.attachmentIds)
        : Promise.resolve({ data: [] as { id: string }[] }),
      d.sourceMessageIds.length
        ? supabase.from("source_messages").select("id").eq("import_id", draft.import_id).in("id", d.sourceMessageIds)
        : Promise.resolve({ data: [] as { id: string }[] }),
    ]);
    if ((atts?.length ?? 0) !== d.attachmentIds.length || (msgs?.length ?? 0) !== d.sourceMessageIds.length) {
      return { ok: false, error: "Evidence must belong to this import" };
    }

    const { error } = await supabase
      .from("issue_drafts")
      .update({ attachment_ids: d.attachmentIds, source_message_ids: d.sourceMessageIds })
      .eq("id", d.draftId);
    if (error) throw error;
    revalidatePath(`/imports/${draft.import_id}`);
    return ok(undefined, "Evidence updated");
  } catch (err) {
    return fail(err);
  }
}
