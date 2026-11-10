import type { Metadata } from "next";
import Link from "next/link";
import { Bot, FlaskConical, KeyRound, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/app-shell/topbar";
import { ProfileForm } from "@/components/settings/profile-form";
import { RoleBadge } from "@/components/shared/badges";
import { PageHeader, Section } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { describeConfiguredProvider } from "@/lib/ai";
import { requireViewer } from "@/lib/auth";
import { displayName, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { AuditLog } from "@/types/db";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const viewer = await requireViewer();
  const isAdmin = viewer.profile.role === "admin";
  const provider = describeConfiguredProvider();
  const supabase = await createClient();
  const { data: audit } = isAdmin
    ? await supabase
        .from("audit_logs")
        .select("*, actor:profiles(id, full_name, email)")
        .order("created_at", { ascending: false })
        .limit(50)
        .returns<AuditLog[]>()
    : { data: [] as AuditLog[] };

  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader title="Settings" description="Your profile, preferences and workspace configuration." />

      <Section title="Profile" action={<RoleBadge role={viewer.profile.role} />}>
        <ProfileForm fullName={viewer.profile.full_name} email={viewer.email} />
        <div className="mt-4 flex items-center gap-2 border-t pt-4 text-sm">
          <KeyRound className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">Want to change your password?</span>
          <Button variant="link" className="h-auto p-0" asChild>
            <Link href="/forgot-password">Send a reset link</Link>
          </Button>
        </div>
      </Section>

      <div id="preferences">
        <Section title="Appearance" description="Light, dark or follow your system setting.">
          <div className="flex items-center gap-3 text-sm">
            Theme <ThemeToggle />
          </div>
        </Section>
      </div>

      <Section title="AI provider" description="Configured through server environment variables. Keys are never sent to the browser.">
        <div className="flex items-start gap-3 text-sm">
          {provider.simulated ? <FlaskConical className="mt-0.5 size-5 text-amber-600" aria-hidden /> : <Bot className="mt-0.5 size-5 text-primary" aria-hidden />}
          <div>
            <p className="font-medium">
              {provider.simulated ? "MockAIProvider (demo mode)" : `xAI Grok · ${provider.model}`}
              {!provider.configured && <span className="ml-2 text-destructive">— XAI_API_KEY missing</span>}
            </p>
            <p className="mt-1 text-muted-foreground">
              {provider.simulated
                ? "Deterministic, rule-based extraction that runs locally at no cost. Results are labelled “Simulated”. Set AI_PROVIDER=grok and XAI_API_KEY to use Grok."
                : "Real model calls are billed by xAI per token. Conversations are sent as untrusted data and every response is schema-validated before drafts are created."}
            </p>
          </div>
        </div>
      </Section>

      <Section title="Security" description="How access is enforced in this workspace.">
        <ul className="grid grid-cols-1 gap-2 text-sm text-muted-foreground">
          {[
            "Row Level Security in Postgres limits every query to projects you belong to.",
            "Roles can only be changed by admins; the database rejects anything else.",
            "AI output is stored as drafts and requires human approval; it cannot change data or permissions.",
            "Uploaded files are type-checked by content, size-limited and stored in a private bucket.",
          ].map((t) => (
            <li key={t} className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--status-resolved)]" aria-hidden /> {t}
            </li>
          ))}
        </ul>
      </Section>

      {isAdmin && (
        <Section title="Audit log" description="Most recent 50 security-relevant events. Secrets and message content are never logged.">
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card text-left text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">When</th>
                  <th className="py-1.5 pr-3 font-medium">Who</th>
                  <th className="py-1.5 pr-3 font-medium">Action</th>
                  <th className="py-1.5 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {(audit ?? []).map((a) => (
                  <tr key={a.id} className="border-t align-top">
                    <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">{formatDateTime(a.created_at)}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{a.actor ? displayName(a.actor) : "System"}</td>
                    <td className="py-1.5 pr-3 font-mono whitespace-nowrap">{a.action}</td>
                    <td className="max-w-md truncate py-1.5 font-mono text-muted-foreground" title={JSON.stringify(a.details)}>
                      {JSON.stringify(a.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
