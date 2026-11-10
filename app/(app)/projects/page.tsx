import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { ProjectFormDialog } from "@/components/projects/project-form";
import { ProjectStatusBadge } from "@/components/shared/badges";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { requireViewer } from "@/lib/auth";
import { isUnresolved, type IssueStatus } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/types/db";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const [{ data: projects }, { data: issues }, { data: members }] = await Promise.all([
    supabase.from("projects").select("*").order("created_at", { ascending: false }).returns<Project[]>(),
    supabase.from("issues").select("project_id, status").limit(10000),
    supabase.from("project_members").select("project_id"),
  ]);

  const stats = new Map<string, { total: number; open: number; members: number }>();
  for (const i of issues ?? []) {
    const s = stats.get(i.project_id) ?? { total: 0, open: 0, members: 0 };
    s.total++;
    if (isUnresolved(i.status as IssueStatus)) s.open++;
    stats.set(i.project_id, s);
  }
  for (const m of members ?? []) {
    const s = stats.get(m.project_id) ?? { total: 0, open: 0, members: 0 };
    s.members++;
    stats.set(m.project_id, s);
  }
  const isAdmin = viewer.profile.role === "admin";

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Projects"
        description={isAdmin ? "All projects in the workspace." : "Projects you are a member of."}
        actions={
          isAdmin && (
            <ProjectFormDialog
              trigger={
                <Button>
                  <Plus /> New project
                </Button>
              }
            />
          )
        }
      />
      {!projects?.length ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description={isAdmin ? "Create a project to start tracking issues." : "Ask an admin or manager to add you to a project."}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const s = stats.get(p.id) ?? { total: 0, open: 0, members: 0 };
            const done = s.total ? Math.round(((s.total - s.open) / s.total) * 100) : 0;
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="group flex flex-col rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{p.key}</span>
                      {p.is_demo && <span className="text-[11px] text-muted-foreground">Demo</span>}
                    </div>
                    <h2 className="mt-1.5 truncate font-medium group-hover:text-primary">{p.name}</h2>
                    <p className="truncate text-xs text-muted-foreground">{p.client_name || "No client"}</p>
                  </div>
                  <ProjectStatusBadge status={p.status} />
                </div>
                <p className="mt-3 line-clamp-2 min-h-10 text-sm text-muted-foreground">{p.description || "No description."}</p>
                <div className="mt-4 grid gap-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {s.open} open · {s.total} total
                    </span>
                    <span className="tabular-nums">{done}% resolved</span>
                  </div>
                  <Progress value={done} className="h-1.5" aria-label={`${done}% resolved`} />
                </div>
                <div className="mt-3 flex justify-between border-t pt-3 text-xs text-muted-foreground">
                  <span>{s.members} member(s)</span>
                  <span>Created {formatDate(p.created_at)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
