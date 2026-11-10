// Orchestrates extraction: batching large chats, calling the provider, retrying once on
// malformed output, validating, and de-duplicating across batches.

import { findDuplicates, similarity, type DuplicateCandidate } from "./duplicates";
import { AIOutputError, validateExtraction, type ValidatedIssue } from "./validate";
import { AIProviderError, type AIProvider, type ExtractionInput } from "./types";

export const BATCH_SIZE = 150;

export interface ExtractedDraft extends ValidatedIssue {
  duplicateCandidates: DuplicateCandidate[];
}

export interface ExtractionOutcome {
  drafts: ExtractedDraft[];
  findings: Record<string, string>;
  warnings: string[];
  batches: number;
  rawOutputs: string[];
}

export interface ExistingIssueForDedup {
  id: string;
  key: string;
  title: string;
  description: string;
  status: string;
}

const MAX_RATE_LIMIT_WAIT_MS = 30_000;

async function callWithRetry(provider: AIProvider, input: ExtractionInput) {
  let lastError: unknown;
  // One retry for malformed output or transient errors; rate limits (with a wait the
  // provider asks for) get up to three, so multi-batch imports on free plans complete.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const raw = await provider.extract(input);
      return { raw, report: validateExtraction(raw, input) };
    } catch (err) {
      lastError = err;
      const rateLimited = err instanceof AIProviderError && err.retryAfterMs !== undefined;
      const retryable = err instanceof AIOutputError || (err instanceof AIProviderError && err.retryable);
      if (!retryable || attempt >= (rateLimited ? 3 : 1)) break;
      const wait = rateLimited ? Math.min(err.retryAfterMs!, MAX_RATE_LIMIT_WAIT_MS) : 1000 * (attempt + 1);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastError;
}

export async function runExtraction(
  provider: AIProvider,
  input: ExtractionInput,
  existing: ExistingIssueForDedup[],
): Promise<ExtractionOutcome> {
  const size = provider.info.batchSize ?? BATCH_SIZE;
  const existingIssues = input.existingIssues.slice(0, provider.info.maxExistingIssues ?? 200);
  const batches: ExtractionInput[] = [];
  for (let i = 0; i < Math.max(1, input.messages.length); i += size) {
    batches.push({
      ...input,
      existingIssues,
      messages: input.messages.slice(i, i + size),
      // loose screenshots go with the first batch only
      looseAttachments: i === 0 ? input.looseAttachments : [],
    });
  }

  const drafts: ExtractedDraft[] = [];
  const findings: Record<string, string> = {};
  const warnings: string[] = [];
  const rawOutputs: string[] = [];

  for (const batch of batches) {
    const { raw, report } = await callWithRetry(provider, batch);
    rawOutputs.push(raw);
    Object.assign(findings, report.findings);
    warnings.push(...report.warnings);

    for (const issue of report.issues) {
      const candidates = findDuplicates(issue, existing, "issue");
      if (issue.possibleDuplicateOf) {
        const match = existing.find((e) => e.key.toUpperCase() === issue.possibleDuplicateOf);
        if (match && !candidates.some((c) => c.id === match.id)) {
          candidates.unshift({
            type: "issue",
            id: match.id,
            key: match.key,
            title: match.title,
            score: Math.max(similarity(issue, match), 0.5),
            source: "ai",
          });
        }
      }
      drafts.push({ ...issue, duplicateCandidates: candidates });
    }
  }

  // Flag near-identical drafts within this import (e.g. the same issue split across batches).
  for (let i = 0; i < drafts.length; i++) {
    for (let j = i + 1; j < drafts.length; j++) {
      const score = similarity(drafts[i], drafts[j]);
      if (score >= 0.5) {
        drafts[j].duplicateCandidates.push({
          type: "draft",
          id: String(i), // resolved to the real draft id after insert
          title: drafts[i].title,
          score,
          source: "similarity",
        });
      }
    }
  }

  return { drafts, findings, warnings: [...new Set(warnings)], batches: batches.length, rawOutputs };
}
