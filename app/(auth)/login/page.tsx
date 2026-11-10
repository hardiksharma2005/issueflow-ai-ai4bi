import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  return (
    <div className="grid grid-cols-1 gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to your workspace.</p>
      </div>
      <LoginForm next={next} linkError={params.error === "link"} />
      <p className="text-sm text-muted-foreground">
        New to IssueFlow AI?{" "}
        <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
