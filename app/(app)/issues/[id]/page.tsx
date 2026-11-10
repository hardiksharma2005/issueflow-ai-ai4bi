import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Attachments } from "@/components/issues/attachments";
import { Comments } from "@/components/issues/comments";
import { DeleteIssueButton } from "@/components/issues/delete-issue";
import { IssueEditor } from "@/components/issues/issue-editor";
import { IssueProperties } from "@/components/issues/issue-properties";
import { MessageList, type MessageView } from "@/components/imports/message-list";
import { CategoryBadge, PriorityBadge, StatusBadge } from "@/components/shared/badges";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { Section } from "@/components/shared/page";
import { UserAvatar } from "@/components/shared/user-avatar";
import { isOverdue } from "@/lib/analytics";
import { requireViewer } from "@/lib/auth";
import { PRIORITY_LABELS, STATUS_LABELS, type IssueCategory, type IssuePriority, type IssueStatus } from "@/lib/domain";
import { displayName, formatDate, formatDateTime, timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Attachment, Issue, IssueActivity } from "@/types/db";

export async function generateMetadata({ params }: PageProps<"/issues/[id]">): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("issues").select("title, number, project:projects(key)").eq("id", id).maybeSingle();
  if (!data) return { title: "Issue" };
  return { title: `${(data.project as unknown as { key: string })?.key}-${data.number} ${data.title}` };
}

function describeActivity(a: IssueActivity) {
  const label = (v: string | null, map: Record<string, string>) => (v ? (map[v] ?? v) : "none");
  switch (a.action) {
    case "created":
      return a.to_value === "whatsapp_import" ? "created this issue from a WhatsApp import" : "created this issue";
    case "status_changed":
      return `changed status from ${label(a.from_value, STATUS_LABELS)} to ${label(a.to_value, STATUS_LABELS)}`;
    case "priority_changed":
      return `changed priority from ${label(a.from_value, PRIORITY_LABELS)} to ${label(a.to_value, PRIORITY_LABELS)}`;
    case "assigned":
      return a.to_value ? `assigned this to ${a.to_value}` : `unassigned ${a.from_value ?? ""}`.trim();
    case "due_date_changed":
      return a.to_value ? `set the due date to ${formatDate(a.to_value)}` : "removed the due date";
    case "updated":
      return `updated the ${a.to_value}`;
    case "commented":
      return "commented";
    case "attachment_added":
      return `attached ${a.to_value}`;
    default:
      return a.action;
  }
}

export default async function IssuePage({ params }: PageProps<"/issues/[id]">) {
  const viewer = await requireViewer();
  const { id } = await params;
  const supabase = await createClient();

  const { data: issue } = await supabase
    .from("issues")
    .select("*, project:projects(id, key, name), assignee:profiles!issues_assignee_id_fkey(id, full_name, email), creator:profiles!issues_created_by_fkey(full_name, email)")
    .eq("id", id)
    .maybeSingle();
  if (!issue) notFound();
  const project = issue.project as { id: string; key: string; name: string };

  const [{ data: canManage }, { data: comments }, { data: attachments }, { data: activity }, { data: links }, { data: memberRows }] = await Promise.all([
    supabase.rpc("can_manage_project", { p_project: project.id }),
    supabase.from("comments").select("*, author:profiles(id, full_name, email)").eq("issue_id", id).order("created_at"),
    supabase.from("attachments").select("*").eq("issue_id", id).order("created_at").returns<Attachment[]>(),
    supabase.from("issue_activity").select("*, actor:profiles(id, full_name, email)").eq("issue_id", id).order("created_at", { ascending: false }).limit(100).returns<IssueActivity[]>(),
    supabase.from("issue_source_messages").select("message:source_messages(*)").eq("issue_id", id),
    supabase.from("project_members").select("profile:profiles(id, full_name, email)").eq("project_id", project.id),
  ]);

  const signed = attachments?.length
    ? (await supabase.storage.from("evidence").createSignedUrls(attachments.map((a) => a.storage_path), 3600)).data
    : [];
  const urlFor = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const messages = (links ?? [])
    .map((l) => l.message as unknown as MessageView)
    .filter(Boolean)
    .sort((a, b) => a.seq - b.seq);
  const members = (memberRows ?? []).map((m) => {
    const p = m.profile as unknown as { id: string; full_name: string; email: string };
    return { id: p.id, name: p.full_name || p.email };
  });

  const isAssignee = issue.assignee_id === viewer.id;
  const typed = issue as unknown as Issue;
  const assignee = issue.assignee as { full_name: string; email: string } | null;
  const creator = issue.creator as { full_name: string; email: string } | null;
  const overdue = isOverdue(typed);

  return (
    <div className="grid gap-6">
      <Breadcrumbs
        items={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${project.id}` },
          { label: `${project.key}-${issue.number}` },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="grid min-w-0 content-start gap-6">
          <div className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {project.key}-{issue.number}
              </span>
              <StatusBadge status={issue.status as IssueStatus} />
              <PriorityBadge priority={issue.priority as IssuePriority} />
              <CategoryBadge category={issue.category as IssueCategory} />
              {overdue && <span className="text-xs font-medium text-destructive">Overdue</span>}
            </div>
            <IssueEditor id={issue.id} title={issue.title} description={issue.description} canEdit={Boolean(canManage)} />
          </div>

          {messages.length > 0 && (
            <Section
              title={
                <span className="flex items-center gap-2">
                  <MessageCircle className="size-4 text-[#25D366]" aria-hidden /> Source messages
                </span>
              }
              description="Original WhatsApp messages this issue was created from (unmodified)."
              action={
                issue.import_id ? (
                  <Link href={`/imports/${issue.import_id}`} className="text-xs text-muted-foreground hover:text-foreground">
                    View import →
                  </Link>
                ) : null
              }
            >
              <MessageList messages={messages} />
            </Section>
          )}

          <Section title={`Attachments (${attachments?.length ?? 0})`} description="Screenshots and documents kept as evidence.">
            <Attachments
              issueId={issue.id}
              projectId={project.id}
              canUpload
              attachments={(attachments ?? []).map((a) => ({
                id: a.id,
                fileName: a.file_name,
                mimeType: a.mime_type,
                sizeBytes: a.size_bytes,
                url: urlFor.get(a.storage_path) ?? null,
                aiDescription: a.ai_description,
                canDelete: Boolean(canManage) || a.uploaded_by === viewer.id,
              }))}
            />
          </Section>

          <Section title={`Comments (${comments?.length ?? 0})`}>
            <Comments
              issueId={issue.id}
              viewerId={viewer.id}
              canModerate={Boolean(canManage)}
              comments={(comments ?? []).map((c) => ({
                id: c.id,
                body: c.body,
                authorId: c.author_id,
                authorName: displayName(c.author as { full_name: string; email: string } | null) || "Former user",
                createdLabel: timeAgo(c.created_at),
              }))}
            />
          </Section>
        </div>

        <aside className="grid content-start gap-4">
          <section className="rounded-xl border bg-card p-4">
            <IssueProperties issue={typed} members={members} canManage={Boolean(canManage)} canChangeStatus={Boolean(canManage) || isAssignee} />
            {!canManage && (
              <p className="mt-2 text-xs text-muted-foreground">
                {isAssignee ? "As the assignee you can change the status." : "Only managers of this project or the assignee can change this issue."}
              </p>
            )}
            <dl className="mt-3 grid gap-2 border-t pt-3 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Reporter</dt>
                <dd className="truncate">{issue.reporter_name || displayName(creator)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Created</dt>
                <dd>{formatDateTime(issue.created_at)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Updated</dt>
                <dd>{timeAgo(issue.updated_at)}</dd>
              </div>
              {issue.resolved_at && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Resolved</dt>
                  <dd>{formatDateTime(issue.resolved_at)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Source</dt>
                <dd>{issue.source === "whatsapp_import" ? "WhatsApp import" : "Manual"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Assignee</dt>
                <dd className="truncate">{displayName(assignee)}</dd>
              </div>
            </dl>
            {canManage && (
              <div className="mt-4 border-t pt-3">
                <DeleteIssueButton issueId={issue.id} issueKey={`${project.key}-${issue.number}`} projectId={project.id} />
              </div>
            )}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-medium">Activity</h2>
            <ol className="relative grid gap-3 border-l pl-4">
              {(activity ?? []).map((a) => (
                <li key={a.id} className="relative text-xs">
                  <span className="absolute top-1 -left-[1.3rem] size-2 rounded-full border-2 border-background bg-muted-foreground/50" aria-hidden />
                  <div className="flex items-start gap-2">
                    <UserAvatar name={a.actor ? displayName(a.actor) : "System"} size="sm" className="size-5" />
                    <p className="leading-snug">
                      <span className="font-medium">{a.actor ? displayName(a.actor) : "System"}</span>{" "}
                      <span className="text-muted-foreground">{describeActivity(a)}</span>
                      <span className="block text-muted-foreground">{timeAgo(a.created_at)}</span>
                    </p>
                  </div>
                </li>
              ))}
              {(activity ?? []).length === 0 &&<li className="text-xs text-muted-foreground">No activity yet.</li>}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
