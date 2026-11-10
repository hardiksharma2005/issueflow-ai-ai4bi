// Validates raw AI output against the schema AND against the input it was given.
// The model is never trusted: unknown references are discarded, dates/reporters are
// taken from the source messages, and assignees are only kept when explicitly named.

import { rawExtractionSchema, rawIssueSchema } from "./schema";
import type { ExtractionInput } from "./types";
import type { IssueCategory, IssuePriority } from "@/lib/domain";

export interface ValidatedIssue {
  title: string;
  description: string;
  category: IssueCategory;
  priority: IssuePriority;
  reportedBy: string | null;
  reportedAt: string | null;
  messageRefs: string[];
  attachmentRefs: string[];
  suggestedAssignee: string | null;
  confidence: number;
  possibleDuplicateOf: string | null;
}

export interface ValidationReport {
  issues: ValidatedIssue[];
  /** attachment ref -> what the provider saw in it */
  findings: Record<string, string>;
  droppedIssues: number;
  warnings: string[];
}

export class AIOutputError extends Error {}

/** Extract the JSON object from a model reply (tolerates ```json fences and surrounding prose). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) throw new AIOutputError("AI response did not contain JSON");
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      throw new AIOutputError("AI response contained malformed JSON");
    }
  }
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0.5));

export function validateExtraction(rawText: string, input: ExtractionInput): ValidationReport {
  const parsed = rawExtractionSchema.safeParse(extractJson(rawText));
  if (!parsed.success) {
    throw new AIOutputError("AI response did not match the expected structure");
  }

  const messageByRef = new Map(input.messages.map((m) => [m.ref, m]));
  const attachmentRefs = new Set<string>([
    ...input.messages.flatMap((m) => (m.attachment ? [m.attachment.ref] : [])),
    ...input.looseAttachments.map((a) => a.ref),
  ]);
  const existingKeys = new Set(input.existingIssues.map((i) => i.key.toUpperCase()));
  const senders = new Set(input.messages.map((m) => m.sender).filter((s): s is string => !!s));

  const warnings: string[] = [];
  const issues: ValidatedIssue[] = [];
  let droppedIssues = 0;

  for (const candidate of parsed.data.issues) {
    const result = rawIssueSchema.safeParse(candidate);
    if (!result.success) {
      droppedIssues++;
      continue;
    }
    const raw = result.data;

    const messageRefs = [...new Set(raw.message_refs.filter((r) => messageByRef.has(r)))];
    // Attachments referenced via their message also count as evidence.
    const attRefs = new Set(raw.attachment_refs.filter((r) => attachmentRefs.has(r)));
    for (const ref of messageRefs) {
      const att = messageByRef.get(ref)?.attachment;
      if (att) attRefs.add(att.ref);
    }

    if (messageRefs.length === 0 && attRefs.size === 0) {
      // An issue with no evidence in the conversation is an invention.
      droppedIssues++;
      continue;
    }

    const sourceMessages = messageRefs.map((r) => messageByRef.get(r)!);
    const ordered = [...sourceMessages].sort((a, b) => (a.sentAt ?? "").localeCompare(b.sentAt ?? ""));

    // Reporter must be a real sender of one of the referenced messages.
    const referencedSenders = new Set(sourceMessages.map((m) => m.sender).filter(Boolean));
    let reportedBy = raw.reported_by && referencedSenders.has(raw.reported_by) ? raw.reported_by : null;
    if (!reportedBy) reportedBy = ordered.find((m) => m.sender)?.sender ?? null;

    // Reported date comes from the source, never from the model.
    const reportedAt = ordered.find((m) => m.sentAt)?.sentAt ?? null;

    // Assignee only if that exact name is literally present in the referenced messages.
    let suggestedAssignee: string | null = null;
    if (raw.suggested_assignee) {
      const name = raw.suggested_assignee.replace(/^@/, "").trim();
      const mentioned = sourceMessages.some((m) => m.text.toLowerCase().includes(name.toLowerCase()));
      if (name && mentioned && (senders.has(name) || /^[\p{L} .'-]{2,60}$/u.test(name))) {
        suggestedAssignee = name;
      } else {
        warnings.push(`Discarded unsupported assignee suggestion "${raw.suggested_assignee}".`);
      }
    }

    const dup = raw.possible_duplicate_of?.toUpperCase() ?? null;

    issues.push({
      title: raw.title.slice(0, 200),
      description: raw.description,
      category: raw.category,
      priority: raw.priority,
      reportedBy,
      reportedAt,
      messageRefs,
      attachmentRefs: [...attRefs],
      suggestedAssignee,
      confidence: Math.round(clamp01(raw.confidence) * 100) / 100,
      possibleDuplicateOf: dup && existingKeys.has(dup) ? dup : null,
    });
  }

  const findings: Record<string, string> = {};
  for (const f of parsed.data.attachment_findings) {
    if (attachmentRefs.has(f.ref)) findings[f.ref] = f.description.slice(0, 2000);
  }

  if (droppedIssues > 0) warnings.push(`${droppedIssues} AI-proposed issue(s) were discarded by validation.`);
  return { issues, findings, droppedIssues, warnings };
}
