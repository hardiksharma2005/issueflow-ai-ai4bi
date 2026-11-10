import { z } from "zod";
import {
  ISSUE_CATEGORIES,
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  PROJECT_STATUSES,
  ROLES,
} from "@/lib/domain";

// Server-side validation for every mutation. The database repeats the critical
// checks (constraints, RLS, triggers); these give users precise error messages.

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const uuid = z.uuid();
const optionalUuid = z
  .union([z.uuid(), z.literal(""), z.literal("none"), z.null()])
  .optional()
  .transform((v) => (v && v !== "none" ? v : null));
const optionalDate = z
  .union([z.iso.date(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters");

export const signInSchema = z.object({
  email: z.email("Enter a valid email address").trim().toLowerCase(),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(120),
  email: z.email("Enter a valid email address").trim().toLowerCase(),
  password: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address").trim().toLowerCase(),
});

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

export const projectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(120),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,9}$/, "Key must be 2–10 letters/digits and start with a letter"),
  clientName: optionalText(120),
  description: z.string().trim().max(5000).default(""),
  status: z.enum(PROJECT_STATUSES).default("active"),
});

export const projectUpdateSchema = projectSchema.omit({ key: true }).extend({ id: uuid });

export const memberSchema = z.object({ projectId: uuid, userId: uuid });

export const issueCreateSchema = z.object({
  projectId: uuid,
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(20000).default(""),
  category: z.enum(ISSUE_CATEGORIES).default("other"),
  priority: z.enum(ISSUE_PRIORITIES).default("medium"),
  status: z.enum(ISSUE_STATUSES).default("open"),
  assigneeId: optionalUuid,
  dueDate: optionalDate,
  reporterName: optionalText(120),
});

export const issueUpdateSchema = z
  .object({
    id: uuid,
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(20000).optional(),
    category: z.enum(ISSUE_CATEGORIES).optional(),
    priority: z.enum(ISSUE_PRIORITIES).optional(),
    status: z.enum(ISSUE_STATUSES).optional(),
    assigneeId: optionalUuid,
    dueDate: optionalDate,
  })
  .strict();

export const commentSchema = z.object({
  issueId: uuid,
  body: z.string().trim().min(1, "Comment cannot be empty").max(10000),
});

export const draftApproveSchema = z.object({
  draftId: uuid,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(20000).default(""),
  category: z.enum(ISSUE_CATEGORIES),
  priority: z.enum(ISSUE_PRIORITIES),
  assigneeId: optionalUuid,
  dueDate: optionalDate,
});

export const draftEvidenceSchema = z.object({
  draftId: uuid,
  attachmentIds: z.array(uuid).max(100),
  sourceMessageIds: z.array(uuid).max(500),
});

export const roleUpdateSchema = z.object({ userId: uuid, role: z.enum(ROLES) });

export const inviteSchema = z.object({
  email: z.email("Enter a valid email address").trim().toLowerCase(),
  fullName: z.string().trim().max(120).optional(),
  role: z.enum(ROLES).default("member"),
});

export const profileSchema = z.object({ fullName: z.string().trim().min(2).max(120) });

export const automationConfigSchema = z.object({
  jobId: z.string().regex(/^[a-z0-9-]+$/),
  enabled: z.boolean().optional(),
  staleDays: z.coerce.number().int().min(1).max(365).optional(),
  lookbackHours: z.coerce.number().int().min(1).max(24 * 30).optional(),
});

export const issueFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  project: z.uuid().optional().catch(undefined),
  status: z.enum(ISSUE_STATUSES).optional().catch(undefined),
  priority: z.enum(ISSUE_PRIORITIES).optional().catch(undefined),
  category: z.enum(ISSUE_CATEGORIES).optional().catch(undefined),
  assignee: z.union([z.uuid(), z.literal("me"), z.literal("unassigned")]).optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  sort: z.enum(["created_desc", "created_asc", "due_asc", "due_desc", "priority", "updated_desc"]).optional().catch(undefined),
  view: z.enum(["table", "board"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
});
export type IssueFilters = z.infer<typeof issueFiltersSchema>;
