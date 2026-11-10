import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { getViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Choose a new password" };

// Reached from the recovery / invite email link, which signs the user in first.
export default async function ResetPasswordPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/forgot-password");
  return (
    <div className="grid grid-cols-1 gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">For {viewer.email}</p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
