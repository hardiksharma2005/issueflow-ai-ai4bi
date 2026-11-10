"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ChevronDown, CopyCheck, GitMerge, Link2, MessageCircle, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { MessageList, type MessageView } from "@/components/imports/message-list";
import { CategoryBadge, ConfidenceMeter, PriorityBadge, SimulatedBadge } from "@/components/shared/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { approveDraft, mergeDraftIntoIssue, mergeDrafts, rejectDraft, updateDraftEvidence } from "@/lib/actions/drafts";
import {
  CATEGORY_LABELS,
  ISSUE_CATEGORIES,
  ISSUE_PRIORITIES,
  PRIORITY_LABELS,
  type IssueCategory,
  type IssuePriority,
} from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { IssueDraft } from "@/types/db";

export interface EvidenceFile {
  id: string;
  fileName: string;
  mimeType: string;
  url: string | null;
  aiDescription: string | null;
}

interface Props {
  drafts: IssueDraft[];
  messages: MessageView[];
  files: EvidenceFile[];
  members: { id: string; name: string }[];
  issues: { id: string; key: string; title: string }[];
  canReview: boolean;
}

export function DraftReview({ drafts, messages, files, members, issues, canReview }: Props) {
  const pending = drafts.filter((d) => d.status === "pending");
  const done = drafts.filter((d) => d.status !== "pending");
  const [showDone, setShowDone] = useState(false);
  return (
    <div className="grid gap-4">
      {pending.length === 0 && (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          All drafts have been reviewed. Approved issues are now in the tracker.
        </div>
      )}
      {pending.map((d) => (
        <DraftCard key={d.id} draft={d} messages={messages} files={files} members={members} issues={issues} otherDrafts={pending.filter((x) => x.id !== d.id)} canReview={canReview} />
      ))}
      {done.length > 0 && (
        <div className="rounded-xl border bg-card">
          <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium" onClick={() => setShowDone((s) => !s)} aria-expanded={showDone}>
            Reviewed drafts ({done.length})
            <ChevronDown className={cn("size-4 transition-transform", showDone && "rotate-180")} aria-hidden />
          </button>
          {showDone && (
            <ul className="divide-y border-t">
              {done.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Badge variant={d.status === "approved" ? "default" : "secondary"} className="capitalize">
                    {d.status}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate">{d.title}</span>
                  {d.approved_issue_id && (
                    <Link href={`/issues/${d.approved_issue_id}`} className="text-xs text-primary hover:underline">
                      Open issue →
                    </Link>
                  )}
                  {d.merged_into_issue_id && (
                    <Link href={`/issues/${d.merged_into_issue_id}`} className="text-xs text-primary hover:underline">
                      Linked issue →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function DraftCard({
  draft,
  messages,
  files,
  members,
  issues,
  otherDrafts,
  canReview,
}: Omit<Props, "drafts"> & { draft: IssueDraft; otherDrafts: IssueDraft[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(draft.title);
  const [description, setDescription] = useState(draft.description);
  const [category, setCategory] = useState<IssueCategory>(draft.category);
  const [priority, setPriority] = useState<IssuePriority>(draft.priority);
  const suggested = members.find((m) => draft.suggested_assignee && m.name.toLowerCase().startsWith(draft.suggested_assignee.toLowerCase().split(" ")[0]));
  const [assignee, setAssignee] = useState(suggested?.id ?? "none");
  const [dueDate, setDueDate] = useState("");
  const [showEvidence, setShowEvidence] = useState(false);
  const [linkTarget, setLinkTarget] = useState(draft.duplicate_candidates.find((c) => c.type === "issue")?.id ?? "");
  const [mergeTarget, setMergeTarget] = useState("");
  const [addSeq, setAddSeq] = useState("");

  const msgSet = new Set(draft.source_message_ids);
  const draftMessages = messages.filter((m) => msgSet.has(m.id));
  const draftFiles = files.filter((f) => draft.attachment_ids.includes(f.id));
  const issueDupes = draft.duplicate_candidates.filter((c) => c.type === "issue");
  const draftDupes = draft.duplicate_candidates.filter((c) => c.type === "draft" && otherDrafts.some((o) => o.id === c.id));

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const res = await fn();
      if (res.ok) toast.success(res.message ?? "Done");
      else toast.error(res.error);
      router.refresh();
    });

  const setEvidence = (attachmentIds: string[], sourceMessageIds: string[]) =>
    run(() => updateDraftEvidence({ draftId: draft.id, attachmentIds, sourceMessageIds }));

  return (
    <article className="rounded-xl border bg-card" aria-busy={pending}>
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        {draft.is_simulated ? <SimulatedBadge /> : <Badge variant="outline">AI · {draft.ai_model}</Badge>}
        <ConfidenceMeter value={Number(draft.confidence)} />
        <span className="text-xs text-muted-foreground">
          Reported by <span className="text-foreground">{draft.reported_by ?? "unknown"}</span>
          {draft.reported_at && ` · ${formatDateTime(draft.reported_at)}`}
        </span>
        {issueDupes.length > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <CopyCheck className="size-3.5" aria-hidden /> Possible duplicate
          </span>
        )}
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_17rem]">
        <div className="grid gap-3">
          {canReview ? (
            <>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-label="Issue title" className="font-medium" />
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} maxLength={20000} aria-label="Issue description" className="text-sm" />
            </>
          ) : (
            <>
              <h3 className="font-medium">{draft.title}</h3>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{draft.description}</p>
            </>
          )}

          <button type="button" className="flex items-center gap-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => setShowEvidence((s) => !s)} aria-expanded={showEvidence}>
            <MessageCircle className="size-3.5" aria-hidden /> {draftMessages.length} source message(s)
            <Paperclip className="ml-2 size-3.5" aria-hidden /> {draftFiles.length} file(s)
            <ChevronDown className={cn("size-3.5 transition-transform", showEvidence && "rotate-180")} aria-hidden />
          </button>

          {draftFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {draftFiles.map((f) =>
                f.mimeType.startsWith("image/") && f.url ? (
                  <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" className="group relative block overflow-hidden rounded-md border" title={f.aiDescription ?? f.fileName}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                    <img src={f.url} alt={f.fileName} className="h-24 w-16 object-cover object-top" />
                  </a>
                ) : (
                  <span key={f.id} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                    <Paperclip className="size-3" aria-hidden /> {f.fileName}
                  </span>
                ),
              )}
            </div>
          )}

          {showEvidence && (
            <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
              {draftMessages.length > 0 ? (
                <ul className="grid gap-1.5">
                  {draftMessages.map((m) => (
                    <li key={m.id} className="flex items-start gap-1">
                      <MessageList messages={[m]} className="flex-1" />
                      {canReview && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove message #${m.seq} from evidence`}
                          onClick={() => setEvidence(draft.attachment_ids, draft.source_message_ids.filter((id) => id !== m.id))}
                        >
                          <X />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No source messages linked.</p>
              )}
              {canReview && (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const m = messages.find((x) => x.seq === Number(addSeq));
                    if (!m) return toast.error(`Message #${addSeq} not found`);
                    setEvidence(draft.attachment_ids, [...new Set([...draft.source_message_ids, m.id])]);
                    setAddSeq("");
                  }}
                >
                  <Input value={addSeq} onChange={(e) => setAddSeq(e.target.value.replace(/\D/g, ""))} placeholder="Message #" className="h-7 w-28" aria-label="Add message by number" />
                  <Button type="submit" variant="outline" size="xs" disabled={!addSeq}>
                    Add message
                  </Button>
                </form>
              )}
              {canReview && files.length > 0 && (
                <fieldset className="grid gap-1.5">
                  <legend className="mb-1 text-xs font-medium text-muted-foreground">Evidence files from this import</legend>
                  {files.map((f) => (
                    <label key={f.id} className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={draft.attachment_ids.includes(f.id)}
                        onCheckedChange={(checked) =>
                          setEvidence(checked ? [...draft.attachment_ids, f.id] : draft.attachment_ids.filter((x) => x !== f.id), draft.source_message_ids)
                        }
                      />
                      <span className="truncate">{f.fileName}</span>
                      {f.aiDescription && <span className="truncate text-muted-foreground">— {f.aiDescription}</span>}
                    </label>
                  ))}
                </fieldset>
              )}
            </div>
          )}

          {issueDupes.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <p className="font-medium">This may already be tracked:</p>
              <ul className="mt-1 grid gap-1">
                {issueDupes.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-xs">
                    <Link href={`/issues/${c.id}`} target="_blank" className="font-mono text-primary hover:underline">
                      {c.key}
                    </Link>
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                    <span className="text-muted-foreground">
                      {Math.round(c.score * 100)}% {c.source === "ai" ? "· flagged by AI" : "match"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {draftDupes.length > 0 && (
            <p className="text-xs text-muted-foreground">Similar to another draft in this import: {draftDupes.map((d) => `“${d.title}”`).join(", ")} — consider merging.</p>
          )}
        </div>

        <div className="grid content-start gap-3">
          {canReview ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                <div className="grid gap-1">
                  <Label className="text-xs">Category</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as IssueCategory)}>
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ISSUE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Priority</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as IssuePriority)}>
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ISSUE_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {PRIORITY_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">
                    Assignee
                    {draft.suggested_assignee && <span className="font-normal text-muted-foreground"> · AI suggests {draft.suggested_assignee}</span>}
                  </Label>
                  <Select value={assignee} onValueChange={setAssignee}>
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs" htmlFor={`due-${draft.id}`}>
                    Due date
                  </Label>
                  <Input id={`due-${draft.id}`} type="date" className="h-8" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  disabled={pending || !title.trim()}
                  onClick={() => run(() => approveDraft({ draftId: draft.id, title, description, category, priority, assigneeId: assignee, dueDate }))}
                >
                  <Check /> Approve
                </Button>
                <Button variant="outline" disabled={pending} onClick={() => run(() => rejectDraft(draft.id))}>
                  <X /> Reject
                </Button>
              </div>
              <div className="grid gap-1.5 border-t pt-3">
                <Label className="text-xs">Link to an existing issue (duplicate / follow-up)</Label>
                <div className="flex gap-2">
                  <Select value={linkTarget} onValueChange={setLinkTarget}>
                    <SelectTrigger className="h-8 min-w-0 flex-1">
                      <SelectValue placeholder="Choose issue…" />
                    </SelectTrigger>
                    <SelectContent>
                      {issues.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.key} · {i.title.slice(0, 50)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" disabled={!linkTarget || pending} onClick={() => run(() => mergeDraftIntoIssue(draft.id, linkTarget))} aria-label="Link draft to selected issue">
                    <Link2 />
                  </Button>
                </div>
              </div>
              {otherDrafts.length > 0 && (
                <div className="grid gap-1.5">
                  <Label className="text-xs">Merge another draft into this one</Label>
                  <div className="flex gap-2">
                    <Select value={mergeTarget} onValueChange={setMergeTarget}>
                      <SelectTrigger className="h-8 min-w-0 flex-1">
                        <SelectValue placeholder="Choose draft…" />
                      </SelectTrigger>
                      <SelectContent>
                        {otherDrafts.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.title.slice(0, 60)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" disabled={!mergeTarget || pending} onClick={() => run(() => mergeDrafts(draft.id, mergeTarget))} aria-label="Merge selected draft into this draft">
                      <GitMerge />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <CategoryBadge category={draft.category} />
              <PriorityBadge priority={draft.priority} />
              <p className="text-xs text-muted-foreground">Only project managers can review drafts.</p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
