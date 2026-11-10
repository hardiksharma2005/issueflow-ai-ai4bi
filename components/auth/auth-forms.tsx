"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset, signIn, signUp, updatePassword } from "@/lib/actions/auth";
import type { ActionResult } from "@/lib/actions/result";

function Field({
  id,
  label,
  error,
  aside,
  ...props
}: React.ComponentProps<typeof Input> & { id: string; label: string; error?: string; aside?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {aside}
      </div>
      <Input id={id} name={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} {...props} />
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function FormMessage({ state }: { state: ActionResult<unknown> | null }) {
  if (!state) return null;
  if (state.ok) {
    return state.message ? (
      <Alert>
        <CircleCheck aria-hidden />
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    ) : null;
  }
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert aria-hidden />
      <AlertDescription>{state.error}</AlertDescription>
    </Alert>
  );
}

const fieldError = (state: ActionResult<unknown> | null, key: string) =>
  state && !state.ok ? state.fieldErrors?.[key] : undefined;

type AuthAction<T> = (prev: unknown, form: FormData) => Promise<ActionResult<T>>;

/**
 * useActionState that also returns the submitted values of `keep` fields. React resets
 * a <form action> after every submission; using these as defaultValue means a validation
 * error does not wipe what the user typed. Passwords are never kept.
 */
function useAuthAction<T>(fn: AuthAction<T>, keep: string[]) {
  const [{ result, values }, action, pending] = useActionState(
    async (_: unknown, form: FormData) => ({
      result: await fn(null, form),
      values: Object.fromEntries(keep.map((k) => [k, String(form.get(k) ?? "")])) as Record<string, string>,
    }),
    { result: null as ActionResult<T> | null, values: {} as Record<string, string> },
  );
  return [result, action, pending, values] as const;
}

export function LoginForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const [state, action, pending, values] = useAuthAction(signIn, ["email"]);
  return (
    <form action={action} className="grid grid-cols-1 gap-4" noValidate>
      {linkError && !state && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertDescription>That link is invalid or has expired. Please try again.</AlertDescription>
        </Alert>
      )}
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next ?? ""} />
      <Field id="email" label="Email" type="email" autoComplete="email" required defaultValue={values.email} error={fieldError(state, "email")} />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        error={fieldError(state, "password")}
        aside={
          <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
            Forgot password?
          </Link>
        }
      />
      <Button type="submit" disabled={pending} className="h-9">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending, values] = useAuthAction(signUp, ["fullName", "email"]);
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="grid grid-cols-1 gap-4" noValidate>
      <FormMessage state={state} />
      <Field id="fullName" label="Full name" autoComplete="name" required defaultValue={values.fullName} error={fieldError(state, "fullName")} />
      <Field id="email" label="Work email" type="email" autoComplete="email" required defaultValue={values.email} error={fieldError(state, "email")} />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        error={fieldError(state, "password")}
      />
      <p className="-mt-2 text-xs text-muted-foreground">At least 8 characters.</p>
      <Button type="submit" disabled={pending} className="h-9">
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending, values] = useAuthAction(requestPasswordReset, ["email"]);
  return (
    <form action={action} className="grid grid-cols-1 gap-4" noValidate>
      <FormMessage state={state} />
      <Field id="email" label="Email" type="email" autoComplete="email" required defaultValue={values.email} error={fieldError(state, "email")} />
      <Button type="submit" disabled={pending} className="h-9">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useAuthAction(updatePassword, []);
  return (
    <form action={action} className="grid grid-cols-1 gap-4" noValidate>
      <FormMessage state={state} />
      <Field id="password" label="New password" type="password" autoComplete="new-password" required error={fieldError(state, "password")} />
      <Field id="confirm" label="Confirm password" type="password" autoComplete="new-password" required error={fieldError(state, "confirm")} />
      <Button type="submit" disabled={pending} className="h-9">
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
