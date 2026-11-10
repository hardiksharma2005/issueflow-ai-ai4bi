import { z } from "zod";
import { ISSUE_CATEGORIES, ISSUE_PRIORITIES } from "@/lib/domain";

// Zod schema for what we ACCEPT from a model. Deliberately tolerant on input
// (extra keys stripped, numbers coerced) but strict on meaning (enums, lengths).
export const rawIssueSchema = z.object({
  title: z.string().trim().min(3).max(300),
  description: z.string().trim().max(20000).default(""),
  category: z.enum(ISSUE_CATEGORIES).catch("other"),
  priority: z.enum(ISSUE_PRIORITIES).catch("medium"),
  reported_by: z.string().trim().max(120).nullable().default(null),
  message_refs: z.array(z.string().max(20)).max(500).default([]),
  attachment_refs: z.array(z.string().max(20)).max(100).default([]),
  suggested_assignee: z.string().trim().max(120).nullable().default(null),
  confidence: z.coerce.number().catch(0.5),
  possible_duplicate_of: z.string().trim().max(30).nullable().default(null),
});

export const rawExtractionSchema = z.object({
  issues: z.array(z.unknown()).max(200),
  attachment_findings: z
    .array(z.object({ ref: z.string().max(20), description: z.string().max(2000) }))
    .max(200)
    .default([]),
});

// JSON Schema sent to xAI structured outputs (strict mode). Kept hand-written so it
// only uses keywords the API documents as enforced.
const nullableString = { type: ["string", "null"] };

export const extractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["issues", "attachment_findings"],
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "description",
          "category",
          "priority",
          "reported_by",
          "message_refs",
          "attachment_refs",
          "suggested_assignee",
          "confidence",
          "possible_duplicate_of",
        ],
        properties: {
          title: { type: "string", description: "Short descriptive title, max 90 characters" },
          description: { type: "string", description: "Factual summary of the problem with relevant quotes" },
          category: { type: "string", enum: [...ISSUE_CATEGORIES] },
          priority: { type: "string", enum: [...ISSUE_PRIORITIES] },
          reported_by: { ...nullableString, description: "Sender name exactly as in the chat, or null" },
          message_refs: { type: "array", items: { type: "string" } },
          attachment_refs: { type: "array", items: { type: "string" } },
          suggested_assignee: {
            ...nullableString,
            description: "Only if a message explicitly asks a named person to handle it; otherwise null",
          },
          confidence: { type: "number", description: "0 to 1" },
          possible_duplicate_of: { ...nullableString, description: "Key of an existing issue, or null" },
        },
      },
    },
    attachment_findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "description"],
        properties: {
          ref: { type: "string" },
          description: { type: "string", description: "Only what is visibly shown in the image" },
        },
      },
    },
  },
} as const;
