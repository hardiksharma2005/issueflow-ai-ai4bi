import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CopyX, FileImage, Loader2, MessageCircle, Paperclip, Users } from "lucide-react";
import { DraftReview } from "@/components/imports/draft-review";
import { DeleteImportButton, ProcessPanel, RetryButton } from "@/components/imports/import-actions";
import { MessageList, type MessageView } from "@/components/imports/message-list";
import { ImportStatusBadge, SimulatedBadge } from "@/components/shared/badges";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { PageHeader, Section } from "@/components/shared/page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { describeConfiguredProvider } from "@/lib/ai";
import { requireViewer } from "@/lib/auth";
import { displayName, formatBytes, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Attachment, ImportRecord, IssueDraft } from "@/types/db";

export const metadata: Metadata = { title: "Import" };

export default async function ImportPage({ params }: PageProps<"/imports/[id]">) {
  await requireViewer();
  const { id } = await params;
  const supabase = await createClient();

  const { data: imp } = await supabase
    .from("imports")
    .select("*, project:projects(id, name, key), creator:profiles!imports_created_by_fkey(full_name, email)")
    .eq("id", id)
    .maybeSingle();
  if (!imp) notFound();
  const record = imp as ImportRecord;
  const project = imp.project as { id: string; name: string; key: string };

  const [{ data: canManage }, { data: messages }, { data: attachments }, { data: drafts }, { data: memberRows }, { data: issues }] = await Promise.all([
    supabase.rpc("can_manage_project", { p_project: project.id }),
    supabase.from("source_messages").select("*").eq("import_id", id).order("seq").limit(5000),
    supabase.from("attachments").select("*").eq("import_id", id).order("created_at").returns<Attachment[]>(),
    supabase.from("issue_drafts").select("*").eq("import_id", id).order("created_at").returns<IssueDraft[]>(),
    supabase.from("project_members").select("profile:profiles(id, full_name, email)").eq("project_id", project.id),
    supabase.from("issues").select("id, number, title").eq("project_id", project.id).order("number", { ascending: false }).limit(300),
  ]);

  // Evidence that was moved onto approved issues is still shown with its draft.
  const draftAttachmentIds = [...new Set((drafts ?? []).flatMap((d) => d.attachment_ids))];
  const missingIds = draftAttachmentIds.filter((x) => !(attachments ?? []).some((a) => a.id === x));
  const extra = missingIds.length ? (await supabase.from("attachments").select("*").in("id", missingIds).returns<Attachment[]>()).data ?? [] : [];
  const allFiles = [...(attachments ?? []), ...extra];
  const signed = allFiles.length ? (await supabase.storage.from("evidence").createSignedUrls(allFiles.map((a) => a.storage_path), 3600)).data ?? [] : [];
  const urlFor = new Map(signed.map((s) => [s.path, s.signedUrl]));

  const msgs = (messages ?? []) as MessageView[];
  const participants = [...new Set(msgs.filter((m) => !m.is_system && m.sender).map((m) => m.sender!))];
  const warnings = (record.parse_warnings ?? []) as string[];
  const provider = describeConfiguredProvider();
  const members = (memberRows ?? []).map((m) => {
    const p = m.profile as unknown as { id: string; full_name: string; email: string };
    return { id: p.id, name: p.full_name || p.email };
  });
  const msgById = new Map(msgs.map((m) => [m.id, m]));
  const pendingCount = (drafts ?? []).filter((d) => d.status === "pending").length;

  return (
    <div className="grid grid-cols-1 gap-6">
      <div>
        <Breadcrumbs items={[{ label: "Imports", href: "/imports" }, { label: record.file_names[0] ?? "Import" }]} />
        <PageHeader
          title={record.file_names.length ? record.file_names.join(", ") : "WhatsApp import"}
          description={
            <span className="flex flex-wrap items-center gap-2">
              <ImportStatusBadge status={record.status} />
              {record.ai_simulated && <SimulatedBadge />}
              <span>
                <Link href={`/projects/${project.id}`} className="hover:text-foreground">
                  {project.name}
                </Link>{" "}
                · by {displayName(imp.creator as { full_name: string; email: string } | null)} · {formatDateTime(record.created_at)}
              </span>
            </span>
          }
          actions={canManage ? <DeleteImportButton importId={id} /> : null}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: MessageCircle, label: "Messages", value: record.message_count },
          { icon: Users, label: "Participants", value: participants.length },
          { icon: FileImage, label: "Media files", value: record.media_count },
          { icon: Paperclip, label: "Issue drafts", value: record.draft_count },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {s.label} <s.icon className="size-3.5" aria-hidden />
            </div>
            <div className="mt-1 text-xl font-semibold">{s.value}</div>
          </div>
        ))}
      </div>

      {record.status === "failed" && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden />
          <AlertTitle>Import failed</AlertTitle>
          <AlertDescription>
            <p>{record.error_message}</p>
            {canManage && (
              <div className="mt-2">
                <RetryButton importId={id} mode={record.message_count > 0 || record.media_count > 0 ? "process" : "parse"} />
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}
      {record.status === "duplicate" && (
        <Alert>
          <CopyX aria-hidden />
          <AlertTitle>Duplicate import blocked</AlertTitle>
          <AlertDescription>{record.error_message} No messages were stored a second time.</AlertDescription>
        </Alert>
      )}
      {(record.status === "uploaded" || record.status === "parsing") && (
        <Alert>
          <Loader2 className="animate-spin" aria-hidden />
          <AlertTitle>{record.status === "parsing" ? "Extracting messages…" : "Files uploaded"}</AlertTitle>
          <AlertDescription>
            {record.status === "uploaded" && canManage ? <RetryButton importId={id} mode="parse" /> : "Refresh in a moment."}
          </AlertDescription>
        </Alert>
      )}
      {record.status === "processing" && (
        <Alert>
          <Loader2 className="animate-spin" aria-hidden />
          <AlertTitle>AI is analysing the conversation…</AlertTitle>
          <AlertDescription>This usually takes a few seconds. Refresh the page to see the drafts.</AlertDescription>
        </Alert>
      )}
      {record.status === "parsed" && canManage && <ProcessPanel importId={id} provider={provider} />}

      {warnings.length > 0 && (
        <details className="rounded-xl border bg-card px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">Import notes ({warnings.length})</summary>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      {(drafts ?? []).length > 0 && (
        <Section
          title={`Step 9 · Review AI drafts (${pendingCount} pending)`}
          description="Approve to create an issue, edit anything first, reject noise, merge duplicates or link follow-ups to existing issues."
        >
          <DraftReview
            drafts={drafts ?? []}
            messages={msgs}
            canReview={Boolean(canManage)}
            members={members}
            issues={(issues ?? []).map((i) => ({ id: i.id, key: `${project.key}-${i.number}`, title: i.title }))}
            files={allFiles.map((a) => ({ id: a.id, fileName: a.file_name, mimeType: a.mime_type, url: urlFor.get(a.storage_path) ?? null, aiDescription: a.ai_description }))}
          />
        </Section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
        <Section title="Step 6 · Conversation preview" description="Original messages exactly as extracted. System messages are shown but ignored by the AI.">
          {msgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No chat messages in this import.</p>
          ) : (
            <div className="max-h-[36rem] overflow-y-auto pr-1">
              <MessageList messages={msgs} />
            </div>
          )}
        </Section>
        <Section title="Media & files">
          {allFiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No media files.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2">
              {allFiles.map((a) => {
                const linked = a.source_message_id ? msgById.get(a.source_message_id) : null;
                const url = urlFor.get(a.storage_path);
                return (
                  <li key={a.id} className="flex gap-3 rounded-lg border p-2">
                    {a.mime_type.startsWith("image/") && url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                        <img src={url} alt={a.file_name} className="h-16 w-12 rounded object-cover object-top" />
                      </a>
                    ) : (
                      <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded bg-muted">
                        <Paperclip className="size-4 text-muted-foreground" aria-hidden />
                      </div>
                    )}
                    <div className="min-w-0 text-xs">
                      <div className="truncate font-medium">{a.file_name}</div>
                      <div className="text-muted-foreground">{formatBytes(a.size_bytes)}</div>
                      <div className="text-muted-foreground">
                        {linked ? `Matched to message #${linked.seq} (${linked.sender ?? "unknown"})` : "Not linked to a message"}
                      </div>
                      {a.issue_id && (
                        <Link href={`/issues/${a.issue_id}`} className="text-primary hover:underline">
                          Evidence on issue →
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
