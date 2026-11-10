import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Handles links from Supabase emails (confirm sign-up, password recovery, invites).
// Supports both the PKCE "?code=" flow and the "?token_hash=&type=" flow.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const nextParam = url.searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";

  const supabase = await createClient();
  let error: unknown = null;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  } else {
    error = new Error("missing token");
  }

  if (error) {
    return NextResponse.redirect(new URL("/login?error=link", url.origin));
  }
  const destination = type === "recovery" || type === "invite" ? "/reset-password" : next;
  return NextResponse.redirect(new URL(destination, url.origin));
}
