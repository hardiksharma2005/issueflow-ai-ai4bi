import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
        <p className="mt-1 text-sm text-muted-foreground">We&apos;ll email you a secure link to choose a new one.</p>
      </div>
      <ForgotPasswordForm />
      <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to sign in
      </Link>
    </div>
  );
}
