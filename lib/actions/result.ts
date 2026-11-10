import { z } from "zod";
import { AuthError } from "@/lib/auth";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

interface PgLikeError {
  code?: string;
  message?: string;
}

/**
 * Convert any thrown error into a safe, user-facing message. Database internals are
 * never returned verbatim except for messages our own triggers raise deliberately.
 */
export function fail(err: unknown): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  if (err instanceof z.ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "form";
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, error: Object.values(fieldErrors)[0] ?? "Invalid input", fieldErrors };
  }
  if (err instanceof AuthError) return { ok: false, error: err.message };

  const pg = err as PgLikeError;
  switch (pg?.code) {
    case "42501":
      // Raised by RLS or by our triggers with a readable message.
      return { ok: false, error: friendly(pg.message) ?? "You do not have permission to do that" };
    case "23505":
      return { ok: false, error: "That already exists (duplicate value)" };
    case "23503":
      return { ok: false, error: "A related record no longer exists" };
    case "23514":
      return { ok: false, error: friendly(pg.message) ?? "The value is not allowed" };
    case "P0002":
      return { ok: false, error: friendly(pg.message) ?? "Not found" };
    case "PGRST116":
      return { ok: false, error: "Not found, or you do not have access" };
  }
  console.error("[action error]", err);
  return { ok: false, error: "Something went wrong. Please try again." };
}

// Only pass through messages written by us in the migrations (no table/column names).
const SAFE_MESSAGES = [
  "Only admins can change roles",
  "At least one admin is required",
  "Members can only change the status of issues assigned to them",
  "Assignee must be a member of the project",
  "Issues cannot be moved between projects",
  "This draft has already been reviewed",
  "You do not have permission to review this import",
  "Draft not found",
  "Issue not found in this project",
  "Both drafts must be pending",
  "Drafts must belong to the same import",
];

function friendly(message?: string) {
  return SAFE_MESSAGES.find((m) => message?.includes(m));
}

export function throwIfError<T extends { error: unknown }>(res: T): T {
  if (res.error) throw res.error;
  return res;
}
