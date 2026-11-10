"use server";

import { revalidatePath } from "next/cache";
import { assertViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { memberSchema, projectSchema, projectUpdateSchema, uuid } from "@/lib/validation/schemas";
import { fail, ok, type ActionResult } from "./result";

export async function createProject(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const viewer = await assertViewer(["admin"]);
    const data = projectSchema.parse(input);
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("projects")
      .insert({
        name: data.name,
        key: data.key,
        client_name: data.clientName,
        description: data.description,
        status: data.status,
        created_by: viewer.id,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return { ok: false, error: `Project key ${data.key} is already in use`, fieldErrors: { key: "Already in use" } };
      throw error;
    }
    revalidatePath("/projects");
    return ok({ id: row.id }, "Project created");
  } catch (err) {
    return fail(err);
  }
}

export async function updateProject(input: unknown): Promise<ActionResult> {
  try {
    await assertViewer(["admin", "manager"]);
    const data = projectUpdateSchema.parse(input);
    const supabase = await createClient();
    const { data: rows, error } = await supabase
      .from("projects")
      .update({ name: data.name, client_name: data.clientName, description: data.description, status: data.status })
      .eq("id", data.id)
      .select("id");
    if (error) throw error;
    if (!rows?.length) return { ok: false, error: "You do not have permission to edit this project" };
    revalidatePath(`/projects/${data.id}`);
    revalidatePath("/projects");
    return ok(undefined, "Project updated");
  } catch (err) {
    return fail(err);
  }
}

export async function deleteProject(projectId: string, confirmKey: string): Promise<ActionResult> {
  try {
    await assertViewer(["admin"]);
    const id = uuid.parse(projectId);
    const supabase = await createClient();
    const { data: project } = await supabase.from("projects").select("key").eq("id", id).single();
    if (!project) return { ok: false, error: "Project not found" };
    if (project.key !== confirmKey.trim().toUpperCase()) {
      return { ok: false, error: `Type the project key ${project.key} to confirm deletion` };
    }
    // Storage objects are not cascaded by Postgres: collect attachments and the raw
    // uploads of every import, and remove them once the rows are gone.
    const { data: files } = await supabase.from("attachments").select("storage_path").eq("project_id", id);
    const { data: imports } = await supabase.from("imports").select("id").eq("project_id", id);
    const paths = (files ?? []).map((f) => f.storage_path);
    for (const imp of imports ?? []) {
      const raw = await supabase.storage.from("evidence").list(`${id}/imports/${imp.id}/raw`);
      paths.push(...(raw.data ?? []).map((o) => `${id}/imports/${imp.id}/raw/${o.name}`));
    }
    const { data: rows, error } = await supabase.from("projects").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!rows?.length) return { ok: false, error: "You do not have permission to delete this project" };
    if (paths.length) await supabase.storage.from("evidence").remove(paths);
    revalidatePath("/projects");
    return ok(undefined, "Project deleted");
  } catch (err) {
    return fail(err);
  }
}

export async function addProjectMember(input: unknown): Promise<ActionResult> {
  try {
    const viewer = await assertViewer(["admin", "manager"]);
    const data = memberSchema.parse(input);
    const supabase = await createClient();
    const { error } = await supabase
      .from("project_members")
      .insert({ project_id: data.projectId, user_id: data.userId, added_by: viewer.id });
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Already a member of this project" };
      throw error;
    }
    revalidatePath(`/projects/${data.projectId}`);
    return ok(undefined, "Member added");
  } catch (err) {
    return fail(err);
  }
}

export async function removeProjectMember(input: unknown): Promise<ActionResult> {
  try {
    await assertViewer(["admin", "manager"]);
    const data = memberSchema.parse(input);
    const supabase = await createClient();
    const { data: rows, error } = await supabase
      .from("project_members")
      .delete()
      .eq("project_id", data.projectId)
      .eq("user_id", data.userId)
      .select("user_id");
    if (error) throw error;
    if (!rows?.length) return { ok: false, error: "You do not have permission to remove this member" };
    revalidatePath(`/projects/${data.projectId}`);
    return ok(undefined, "Member removed");
  } catch (err) {
    return fail(err);
  }
}
