"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { safeRedirectPath } from "@/lib/redirect";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/schemas";
import { fail, ok, type ActionResult } from "./result";

export async function signIn(_: unknown, form: FormData): Promise<ActionResult> {
  let next = "/dashboard";
  try {
    const input = signInSchema.parse(Object.fromEntries(form));
    next = safeRedirectPath(input.next);
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
    if (error) {
      // Same message for unknown email and wrong password (no account enumeration).
      if (error.code === "email_not_confirmed") {
        return { ok: false, error: "Please confirm your email address first (check your inbox)." };
      }
      return { ok: false, error: "Invalid email or password." };
    }
    await supabase.rpc("log_audit_event", { p_action: "auth.login", p_details: {} });
  } catch (err) {
    return fail(err);
  }
  redirect(next);
}

export async function signUp(_: unknown, form: FormData): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  try {
    const input = signUpSchema.parse(Object.fromEntries(form));
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { full_name: input.fullName },
        emailRedirectTo: `${siteUrl()}/auth/callback?next=/dashboard`,
      },
    });
    if (error) {
      if (error.code === "weak_password") return { ok: false, error: error.message };
      if (error.code === "over_email_send_rate_limit") {
        return { ok: false, error: "Too many sign-up emails were sent. Please wait a few minutes and try again." };
      }
      return { ok: false, error: "Could not create the account. The email may already be registered." };
    }
    if (data.session) {
      await supabase.rpc("log_audit_event", { p_action: "auth.login", p_details: { signup: true } });
      redirect("/dashboard");
    }
    return ok({ needsConfirmation: true }, "Check your email to confirm your account.");
  } catch (err) {
    if (isRedirect(err)) throw err;
    return fail(err);
  }
}

export async function requestPasswordReset(_: unknown, form: FormData): Promise<ActionResult> {
  try {
    const input = forgotPasswordSchema.parse(Object.fromEntries(form));
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(input.email, {
      redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
    });
    // Always the same answer, whether or not the account exists.
    return ok(undefined, "If an account exists for that email, a reset link is on its way.");
  } catch (err) {
    return fail(err);
  }
}

export async function updatePassword(_: unknown, form: FormData): Promise<ActionResult> {
  try {
    const input = resetPasswordSchema.parse(Object.fromEntries(form));
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    if (!claims?.claims?.sub) {
      return { ok: false, error: "Your reset link has expired. Request a new one." };
    }
    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) return { ok: false, error: error.code === "same_password" ? "Choose a different password." : "Could not update the password." };
    await supabase.rpc("log_audit_event", { p_action: "auth.password_reset", p_details: {} });
  } catch (err) {
    return fail(err);
  }
  redirect("/dashboard?password=updated");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.rpc("log_audit_event", { p_action: "auth.logout", p_details: {} });
  await supabase.auth.signOut();
  redirect("/login");
}

function isRedirect(err: unknown) {
  return typeof err === "object" && err !== null && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}
