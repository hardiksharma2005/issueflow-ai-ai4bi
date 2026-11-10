"use server";

import { revalidatePath } from "next/cache";
import { assertViewer } from "@/lib/auth";
import { siteUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { inviteSchema, profileSchema, roleUpdateSchema, uuid } from "@/lib/validation/schemas";
import { fail, ok, type ActionResult } from "./result";

export async function updateRole(input: unknown): Promise<ActionResult> {
  try {
    await assertViewer(["admin"]);
    const data = roleUpdateSchema.parse(input);
    const supabase = await createClient();
    // The protect_profile_update trigger re-checks admin rights and keeps one admin.
    const { data: rows, error } = await supabase
      .from("profiles")
      .update({ role: data.role })
      .eq("id", data.userId)
      .select("id");
    if (error) throw error;
    if (!rows?.length) return { ok: false, error: "User not found" };
    revalidatePath("/team");
    return ok(undefined, "Role updated");
  } catch (err) {
    return fail(err);
  }
}

/** Admin-only: sends a Supabase invite email; the role is applied once the profile exists. */
export async function inviteUser(input: unknown): Promise<ActionResult> {
  try {
    await assertViewer(["admin"]);
    const data = inviteSchema.parse(input);
    const admin = createAdminClient();
    const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.fullName ?? "" },
      redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
    });
    if (error) {
      if (error.code === "email_exists") return { ok: false, error: "A user with that email already exists" };
      if (error.code === "over_email_send_rate_limit") {
        return { ok: false, error: "Email rate limit reached on the Supabase free tier. Try again later." };
      }
      return { ok: false, error: "Could not send the invitation" };
    }
    if (data.role !== "member" && invited.user) {
      await admin.from("profiles").update({ role: data.role }).eq("id", invited.user.id);
    }
    revalidatePath("/team");
    return ok(undefined, `Invitation sent to ${data.email}`);
  } catch (err) {
    return fail(err);
  }
}

export async function removeUser(userId: string): Promise<ActionResult> {
  try {
    const viewer = await assertViewer(["admin"]);
    const id = uuid.parse(userId);
    if (id === viewer.id) return { ok: false, error: "You cannot remove your own account" };
    const admin = createAdminClient();
    const { data: target } = await admin.from("profiles").select("role").eq("id", id).single();
    if (target?.role === "admin") {
      const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
      if ((count ?? 0) <= 1) return { ok: false, error: "At least one admin is required" };
    }
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return { ok: false, error: "Could not remove the user" };
    revalidatePath("/team");
    return ok(undefined, "User removed");
  } catch (err) {
    return fail(err);
  }
}

export async function updateProfile(input: unknown): Promise<ActionResult> {
  try {
    const viewer = await assertViewer();
    const data = profileSchema.parse(input);
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").update({ full_name: data.fullName }).eq("id", viewer.id);
    if (error) throw error;
    revalidatePath("/", "layout");
    return ok(undefined, "Profile updated");
  } catch (err) {
    return fail(err);
  }
}
