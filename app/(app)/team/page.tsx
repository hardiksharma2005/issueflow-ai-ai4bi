import type { Metadata } from "next";
import { InviteDialog, RemoveUserButton, RoleSelect } from "@/components/team/team-controls";
import { RoleBadge } from "@/components/shared/badges";
import { PageHeader } from "@/components/shared/page";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireViewer } from "@/lib/auth";
import { isUnresolved, type IssueStatus } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/db";

export const metadata: Metadata = { title: "Team members" };

const ROLE_HELP = [
  { role: "admin" as const, text: "Everything: projects, members, roles, settings and automations." },
  { role: "manager" as const, text: "Create, edit and assign issues and review imports in their projects." },
  { role: "member" as const, text: "View their projects, update the status of assigned issues, comment and upload evidence." },
];

export default async function TeamPage() {
  const viewer = await requireViewer();
  const isAdmin = viewer.profile.role === "admin";
  const supabase = await createClient();
  const [{ data: people }, { data: memberships }, { data: issues }] = await Promise.all([
    supabase.from("profiles").select("*").order("full_name").returns<Profile[]>(),
    supabase.from("project_members").select("user_id, project:projects(name)"),
    supabase.from("issues").select("assignee_id, status").not("assignee_id", "is", null),
  ]);

  const projectsOf = (id: string) =>
    (memberships ?? []).filter((m) => m.user_id === id).map((m) => (m.project as unknown as { name: string }).name);
  const openFor = (id: string) => (issues ?? []).filter((i) => i.assignee_id === id && isUnresolved(i.status as IssueStatus)).length;

  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader
        title="Team members"
        description={isAdmin ? "Manage who has access and what they can do." : "People who share projects with you."}
        actions={isAdmin && <InviteDialog />}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {ROLE_HELP.map((r) => (
          <div key={r.role} className="rounded-xl border bg-card p-3 text-xs text-muted-foreground">
            <RoleBadge role={r.role} />
            <p className="mt-2">{r.text}</p>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden md:table-cell">Projects</TableHead>
              <TableHead className="hidden sm:table-cell text-right">Open issues</TableHead>
              <TableHead className="hidden lg:table-cell">Joined</TableHead>
              {isAdmin && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(people ?? []).map((p) => {
              const projects = projectsOf(p.id);
              const self = p.id === viewer.id;
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <UserAvatar name={p.full_name || p.email} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {p.full_name || p.email} {self && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{p.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{isAdmin && !self ? <RoleSelect userId={p.id} role={p.role} /> : <RoleBadge role={p.role} />}</TableCell>
                  <TableCell className="hidden max-w-64 truncate text-sm text-muted-foreground md:table-cell">{projects.join(", ") || "—"}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{openFor(p.id)}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{formatDate(p.created_at)}</TableCell>
                  {isAdmin && <TableCell>{!self && <RemoveUserButton userId={p.id} name={p.full_name || p.email} />}</TableCell>}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
