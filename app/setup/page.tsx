import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Database } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Setup required" };
export const dynamic = "force-dynamic";

// Shown instead of a crash when the Supabase environment variables are missing.
export default function SetupPage() {
  if (isSupabaseConfigured()) redirect("/login");
  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-6 px-6 py-12">
      <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
        <Database className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Connect a Supabase project</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          IssueFlow AI stores data, accounts and files in Supabase (free tier, no credit card). Add these variables to{" "}
          <code className="rounded bg-muted px-1 font-mono text-xs">.env.local</code> (or your Vercel project) and restart:
        </p>
      </div>
      <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 font-mono text-xs leading-relaxed">
{`NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon or publishable key>
SUPABASE_SERVICE_ROLE_KEY=<service role or secret key>`}
      </pre>
      <p className="text-sm text-muted-foreground">
        Then apply the database migrations — see <code className="font-mono text-xs">docs/08-deployment.md</code>.
      </p>
    </main>
  );
}
