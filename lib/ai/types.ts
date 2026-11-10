import type { IssueCategory, IssuePriority } from "@/lib/domain";

/** One WhatsApp message as presented to an AI provider. Refs ("m12") are opaque ids. */
export interface ExtractionMessage {
  ref: string;
  sender: string | null;
  sentAt: string | null;
  text: string;
  attachment?: ExtractionAttachment;
}

export interface ExtractionAttachment {
  ref: string;
  fileName: string;
  mimeType: string;
  kind: "image" | "document" | "audio" | "video" | "other";
  /** Base64 content, only for images the provider is allowed to look at. */
  base64?: string;
}

export interface ExistingIssueRef {
  key: string;
  title: string;
  status: string;
}

export interface ExtractionInput {
  projectName: string;
  messages: ExtractionMessage[];
  /** Attachments not tied to a specific message (e.g. screenshots uploaded separately). */
  looseAttachments: ExtractionAttachment[];
  existingIssues: ExistingIssueRef[];
}

/** Shape every provider must return (validated with zod in validate.ts). */
export interface RawIssue {
  title: string;
  description: string;
  category: IssueCategory;
  priority: IssuePriority;
  reported_by: string | null;
  message_refs: string[];
  attachment_refs: string[];
  suggested_assignee: string | null;
  confidence: number;
  possible_duplicate_of: string | null;
}

export interface RawAttachmentFinding {
  ref: string;
  description: string;
}

export interface RawExtraction {
  issues: RawIssue[];
  attachment_findings: RawAttachmentFinding[];
}

export interface ProviderInfo {
  /** "mock" | "grok" | "groq" */
  name: string;
  model: string;
  /** true when results are simulated and no real model was called */
  simulated: boolean;
  supportsVision: boolean;
  /** Messages per request; smaller for providers with low token-per-minute limits. */
  batchSize?: number;
  /** Existing issues listed for duplicate detection (they cost input tokens). */
  maxExistingIssues?: number;
}

export interface AIProvider {
  readonly info: ProviderInfo;
  /** Returns the raw (unvalidated) model output as a JSON string. */
  extract(input: ExtractionInput): Promise<string>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
    /** Provider-requested wait before retrying (e.g. a 429 retry-after header). */
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}
