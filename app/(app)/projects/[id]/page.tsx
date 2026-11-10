import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListTodo, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { IssueBoard } from "@/components/issues/issue-board";
import { IssueFilters, Pagination } from "@/components/issues/issue-filters";
import { IssueTable } from "@/components/issues/issue-table";
import { NewIssueDialog } from "@/components/issues/new-issue-dialog";
import { DeleteProjectButton } from "@/components/projects/delete-project";
import { ProjectFormDialog } from "@/components/projects/project-form";
import { ProjectMembers } from "@/components/projects/project-members";
import { ImportStatusBadge, ProjectStatusBadge } from "@/components/shared/badges";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { EmptyState, PageHeader, Section } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { computeDashboard } from "@/lib/analytics";
import { requireViewer } from "@/lib/auth";
import { formatDate, timeAgo } from "@/lib/format";
import { queryIssues } from "@/lib/issue-query";
import { fetchIssuesForReports } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { issueFiltersSchema } from "@/lib/validation/schemas";
import type { ImportRecord, Profile, Project } from "@/types/db";

export async function generateMetadata({ params }: PageProps<"/projects/[id]">): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Project" };
}

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  const viewer = await requireViewer();
  const { id } = await params;
  const sp = await searchParams;
  const filters = issueFiltersSchema.parse(sp);
  const tab = sp.tab === "members" || sp.tab === "imports" ? sp.tab : "issues";
  const supabase = await createClient();

  const { data: project } = await supabase.from("projects").select("*").eq("id", id).maybeSingle<Project>();
  if (!project) notFound();

  const [{ data: canManage }, { data: memberRows }, allIssues, list, { data: imports }, { data: everyone }] = await Promise.all([
    supabase.rpc("can_manage_project", { p_project: id }),
    supabase.from("project_members").select("profile:profiles(id, full_name, email, role)").eq("project_id", id),
    fetchIssuesForReports(supabase, id),
    queryIssues(supabase, filters, viewer.id, { projectId: id, pageSize: filters.view === "board" ? 300 : undefined }),
    supabase.from("imports").select("*").eq("project_id", id).order("created_at", { ascending: false }).limit(20).returns<ImportRecord[]>(),
    viewer.profile.role === "member" ? Promise.resolve({ data: [] }) : supabase.from("profiles").select("id, full_name, email, role").order("full_name"),
  ]);

  const members = (memberRows ?? []).map((m) => m.profile as unknown as Pick<Profile, "id" | "full_name" | "email" | "role">).filter(Boolean);
  const stats = computeDashboard(allIssues as never).counts;
  const isAdmin = viewer.profile.role === "admin";
  const pct = stats.total ? Math.round((stats.resolved / stats.total) * 100) : 0;
  const projectOption = { id: project.id, key: project.key, name: project.name, members: members.map((m) => ({ id: m.id, name: m.full_name || m.email })) };
  const tabHref = (t: string) => `/projects/${id}${t === "issues" ? "" : `?tab=${t}`}`;

  return (
    <div className="grid grid-cols-1 gap-6">
      <div>
        <Breadcrumbs items={[{ label: "Projects", href: "/projects" }, { label: project.name }]} />
        <PageHeader
          title={
            <span className="flex items-center gap-2">
              {project.name}
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-normal text-muted-foreground">{project.key}</span>
            </span>
          }
          description={
            <span className="flex flex-wrap items-center gap-2">
              <ProjectStatusBadge status={project.status} />
              {project.client_name && <span>{project.client_name}</span>}
              <span>· Created {formatDate(project.created_at)}</span>
            </span>
          }
          actions={
            <>
              {canManage && (
                <Button variant="outline" asChild>
                  <Link href={`/imports/new?project=${id}`}>
                    <Upload /> Import chat
                  </Link>
                </Button>
              )}
              {canManage && (
                <NewIssueDialog
                  projects={[projectOption]}
                  trigger={
                    <Button>
                      <Plus /> New issue
                    </Button>
                  }
                />
              )}
              {canManage && (
                <ProjectFormDialog
                  project={project}
                  trigger={
                    <Button variant="ghost" size="icon" aria-label="Edit project">
                      <Pencil />
                    </Button>
                  }
                />
              )}
              {isAdmin && (
                <DeleteProjectButton
                  projectId={project.id}
                  projectKey={project.key}
                  trigger={
                    <Button variant="ghost" size="icon" aria-label="Delete project">
                      <Trash2 />
                    </Button>
                  }
                />
              )}
            </>
          }
        />
        {project.description && <p className="mt-3 max-w-3xl text-sm text-muted-foreground">{project.description}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Total", stats.total],
          ["Open", stats.open + stats.inProgress + stats.blocked],
          ["Blocked", stats.blocked],
          ["Overdue", stats.overdue],
          ["Resolved", `${pct}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 text-xl font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <nav className="flex gap-1 border-b" aria-label="Project sections">
        {[
          ["issues", `Issues (${stats.total})`],
          ["members", `Members (${members.length})`],
          ["imports", `Imports (${imports?.length ?? 0})`],
        ].map(([t, label]) => (
          <Link
            key={t}
            href={tabHref(t)}
            aria-current={tab === t ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "issues" && (
        <div className="grid grid-cols-1 gap-4">
          <IssueFilters showProject={false} people={projectOption.members.map((m) => ({ value: m.id, label: m.name }))} />
          {list.issues.length === 0 ? (
            <EmptyState icon={ListTodo} title="No issues here yet" description="Create an issue or import a WhatsApp conversation into this project." />
          ) : filters.view === "board" ? (
            <IssueBoard issues={list.issues} />
          ) : (
            <>
              <IssueTable issues={list.issues} showProject={false} />
              <Pagination page={list.page} pageSize={list.pageSize} count={list.count} />
            </>
          )}
        </div>
      )}

      {tab === "members" && (
        <Section title="Project members" description="Members can see this project. Managers who are members can manage it.">
          <ProjectMembers projectId={id} members={members} candidates={(everyone ?? []) as Pick<Profile, "id" | "full_name" | "email" | "role">[]} canManage={Boolean(canManage)} />
        </Section>
      )}

      {tab === "imports" && (
        <Section title="WhatsApp imports">
          {!imports?.length ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No imports for this project yet.</p>
          ) : (
            <ul className="-my-2 divide-y">
              {imports.map((imp) => (
                <li key={imp.id}>
                  <Link href={`/imports/${imp.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary">
                    <span className="min-w-0">
                      <span className="block truncate">{imp.file_names.join(", ") || "Upload"}</span>
                      <span className="text-xs text-muted-foreground">
                        {imp.message_count} messages · {imp.media_count} files · {imp.draft_count} drafts · {timeAgo(imp.created_at)}
                      </span>
                    </span>
                    <ImportStatusBadge status={imp.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}
