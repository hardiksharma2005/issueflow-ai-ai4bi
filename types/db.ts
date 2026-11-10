// Row types for the tables in database/migrations. Hand-maintained (Supabase type
// generation needs the CLI); keep in sync when migrations change.
import type {
  DraftStatus,
  ImportStatus,
  IssueCategory,
  IssuePriority,
  IssueStatus,
  ProjectStatus,
  Role,
} from "@/lib/domain";
import type { DuplicateCandidate } from "@/lib/ai/duplicates";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: Role;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  client_name: string | null;
  description: string;
  status: ProjectStatus;
  issue_counter: number;
  is_demo: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Issue {
  id: string;
  project_id: string;
  number: number;
  title: string;
  description: string;
  category: IssueCategory;
  priority: IssuePriority;
  status: IssueStatus;
  reporter_id: string | null;
  reporter_name: string | null;
  assignee_id: string | null;
  due_date: string | null;
  source: "manual" | "whatsapp_import";
  import_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

/** Issue joined with project key/name and assignee, as used by lists. */
export interface IssueListItem extends Issue {
  project: Pick<Project, "id" | "key" | "name"> | null;
  assignee: Pick<Profile, "id" | "full_name" | "email"> | null;
}

export interface Comment {
  id: string;
  issue_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  author?: Pick<Profile, "id" | "full_name" | "email"> | null;
}

export interface Attachment {
  id: string;
  project_id: string;
  issue_id: string | null;
  import_id: string | null;
  source_message_id: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  ai_description: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface ImportRecord {
  id: string;
  project_id: string;
  created_by: string | null;
  status: ImportStatus;
  file_names: string[];
  content_hash: string | null;
  message_count: number;
  media_count: number;
  draft_count: number;
  parse_warnings: string[];
  error_message: string | null;
  ai_provider: string | null;
  ai_model: string | null;
  ai_simulated: boolean | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface SourceMessage {
  id: string;
  import_id: string;
  project_id: string;
  seq: number;
  sender: string | null;
  sent_at: string | null;
  raw_timestamp: string | null;
  body: string;
  is_system: boolean;
  attachment_name: string | null;
  attachment_missing: boolean;
  created_at: string;
}

export interface IssueDraft {
  id: string;
  import_id: string;
  project_id: string;
  title: string;
  description: string;
  category: IssueCategory;
  priority: IssuePriority;
  reported_by: string | null;
  reported_at: string | null;
  suggested_assignee: string | null;
  confidence: number;
  source_message_ids: string[];
  attachment_ids: string[];
  duplicate_candidates: DuplicateCandidate[];
  status: DraftStatus;
  approved_issue_id: string | null;
  merged_into_issue_id: string | null;
  merged_into_draft_id: string | null;
  ai_provider: string;
  ai_model: string;
  is_simulated: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface IssueActivity {
  id: number;
  issue_id: string;
  actor_id: string | null;
  action: string;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
  actor?: Pick<Profile, "id" | "full_name" | "email"> | null;
}

export interface AutomationJob {
  id: string;
  name: string;
  description: string;
  schedule: string;
  enabled: boolean;
  config: Record<string, unknown>;
  last_run_at: string | null;
  last_status: "running" | "success" | "failed" | null;
}

export interface AutomationLog {
  id: string;
  job_id: string;
  trigger: "cron" | "manual";
  triggered_by: string | null;
  status: "running" | "success" | "failed";
  started_at: string;
  finished_at: string | null;
  summary: string | null;
  result: Record<string, unknown>;
  error: string | null;
}

export interface AuditLog {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  project_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  actor?: Pick<Profile, "id" | "full_name" | "email"> | null;
}
