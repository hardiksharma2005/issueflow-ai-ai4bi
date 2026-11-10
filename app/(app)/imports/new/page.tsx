import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { ImportWizard } from "@/components/imports/import-wizard";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New import" };

export default async function NewImportPage({ searchParams }: PageProps<"/imports/new">) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: projects } = await supabase.from("projects").select("id, name, key").neq("status", "archived").order("name");

  // Only list projects this user can manage (the server re-checks on every step).
  const manageable = [];
  for (const p of projects ?? []) {
    const { data } = await supabase.rpc("can_manage_project", { p_project: p.id });
    if (data) manageable.push(p);
  }

  return (
    <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6">
      <div>
        <Breadcrumbs items={[{ label: "Imports", href: "/imports" }, { label: "New import" }]} />
        <PageHeader title="Import a WhatsApp conversation" description="Upload an exported chat and screenshots. Nothing becomes an issue until a person approves it." />
      </div>
      {viewer.profile.role === "member" || manageable.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="You can't import into any project" description="Imports are run by managers and admins of a project. Ask an admin to make you a manager or add you to a project." />
      ) : (
        <ImportWizard projects={manageable} defaultProjectId={typeof sp.project === "string" ? sp.project : undefined} />
      )}
    </div>
  );
}
