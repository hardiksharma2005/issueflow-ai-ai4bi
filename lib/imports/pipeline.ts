import "server-only";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAIProvider } from "@/lib/ai";
import { runExtraction } from "@/lib/ai/extract";
import { PROMPT_VERSION } from "@/lib/ai/prompt";
import type { ExtractionAttachment, ExtractionInput } from "@/lib/ai/types";
import { AIProviderError } from "@/lib/ai/types";
import { AIOutputError } from "@/lib/ai/validate";
import { matchMedia } from "@/lib/whatsapp/media";
import { parseWhatsAppChat, WhatsAppParseError } from "@/lib/whatsapp/parser";
import {
  MAX_IMPORT_TOTAL_BYTES,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_UNCOMPRESSED_BYTES,
  checkFile,
  sanitizeFileName,
  sniffMatches,
  typeFromName,
} from "@/lib/validation/files";
import type { ImportRecord } from "@/types/db";

const BUCKET = "evidence";
export const AI_RUNS_PER_HOUR = 15;

export class ImportError extends Error {}

interface LoadedFile {
  name: string;
  bytes: Uint8Array;
  mime: string;
  kind: string;
}

export const rawPrefix = (projectId: string, importId: string) => `${projectId}/imports/${importId}/raw`;

async function setStatus(
  supabase: SupabaseClient,
  importId: string,
  patch: Partial<ImportRecord> & Record<string, unknown>,
) {
  const { error } = await supabase.from("imports").update(patch).eq("id", importId);
  if (error) throw error;
}

async function loadImport(supabase: SupabaseClient, importId: string) {
  const { data, error } = await supabase.from("imports").select("*").eq("id", importId).single<ImportRecord>();
  if (error || !data) throw new ImportError("Import not found");
  const { data: canManage } = await supabase.rpc("can_manage_project", { p_project: data.project_id });
  if (!canManage) throw new ImportError("Only managers of this project can process imports");
  return data;
}

/** Extract chat text + media from uploaded files (TXT, ZIP, images, documents). */
async function collectFiles(supabase: SupabaseClient, imp: ImportRecord) {
  const prefix = rawPrefix(imp.project_id, imp.id);
  const { data: objects, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 100 });
  if (error) throw error;
  if (!objects?.length) throw new ImportError("No uploaded files were found for this import");

  const chats: { name: string; text: string }[] = [];
  const media: LoadedFile[] = [];
  const warnings: string[] = [];
  let total = 0;

  for (const obj of objects) {
    const { data: blob, error: dlError } = await supabase.storage.from(BUCKET).download(`${prefix}/${obj.name}`);
    if (dlError || !blob) throw new ImportError(`Could not read ${obj.name}`);
    total += blob.size;
    if (total > MAX_IMPORT_TOTAL_BYTES) throw new ImportError("Import is larger than 100 MB in total");

    const check = checkFile(obj.name, blob.size);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!check.ok || !check.info) {
      warnings.push(check.error ?? `${obj.name}: rejected`);
      continue;
    }
    if (!sniffMatches(bytes, check.info)) {
      warnings.push(`${obj.name}: content does not match the file type, skipped`);
      continue;
    }

    if (check.info.kind === "chat") {
      chats.push({ name: obj.name, text: new TextDecoder("utf-8").decode(bytes) });
    } else if (check.info.kind === "zip") {
      const extracted = await unzip(bytes, warnings);
      chats.push(...extracted.chats);
      media.push(...extracted.media);
    } else {
      media.push({ name: obj.name, bytes, mime: check.info.mime, kind: check.info.kind });
    }
  }
  return { chats, media, warnings, fileNames: objects.map((o) => o.name) };
}

async function unzip(bytes: Uint8Array, warnings: string[]) {
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files).filter(
    (e) => !e.dir && !e.name.startsWith("__MACOSX/") && !e.name.split("/").pop()!.startsWith("."),
  );
  if (entries.length > MAX_ZIP_ENTRIES) throw new ImportError(`ZIP contains more than ${MAX_ZIP_ENTRIES} files`);

  const chats: { name: string; text: string }[] = [];
  const media: LoadedFile[] = [];
  let uncompressed = 0;
  for (const entry of entries) {
    const name = entry.name.split("/").pop()!; // flatten: never trust paths inside archives
    const info = typeFromName(name);
    if (!info || info.kind === "zip") {
      warnings.push(`${name}: unsupported file inside ZIP, skipped`);
      continue;
    }
    const data = await entry.async("uint8array");
    uncompressed += data.byteLength;
    if (uncompressed > MAX_ZIP_UNCOMPRESSED_BYTES) throw new ImportError("ZIP expands to more than 200 MB");
    const check = checkFile(name, data.byteLength);
    if (!check.ok || !sniffMatches(data, info)) {
      warnings.push(check.error ?? `${name}: content does not match the file type, skipped`);
      continue;
    }
    if (info.kind === "chat") chats.push({ name, text: new TextDecoder("utf-8").decode(data) });
    else media.push({ name, bytes: data, mime: info.mime, kind: info.kind });
  }
  return { chats, media };
}

/** Steps 3–6 of the import wizard: validate, extract messages, match media, store. */
export async function parseImport(
  supabase: SupabaseClient,
  importId: string,
  userId: string,
  timezoneOffsetMinutes = 0,
) {
  const imp = await loadImport(supabase, importId);
  if (!["uploaded", "failed"].includes(imp.status) || imp.message_count > 0) {
    throw new ImportError("This import has already been parsed");
  }
  await setStatus(supabase, imp.id, { status: "parsing", error_message: null });

  try {
    const { chats, media, warnings, fileNames } = await collectFiles(supabase, imp);
    if (chats.length > 1) warnings.push(`${chats.length} chat files found; they were combined in upload order.`);
    if (chats.length === 0 && media.length === 0) throw new ImportError("No supported files were found");

    // Duplicate-import protection: hash the normalised chat text (or the media bytes).
    const hash = createHash("sha256");
    if (chats.length) for (const c of chats) hash.update(c.text.replace(/\r\n?/g, "\n").trim());
    else for (const m of [...media].sort((a, b) => a.name.localeCompare(b.name))) hash.update(m.bytes);
    const contentHash = hash.digest("hex");

    const { data: dupes } = await supabase
      .from("imports")
      .select("id, created_at")
      .eq("project_id", imp.project_id)
      .eq("content_hash", contentHash)
      .not("status", "in", "(failed,duplicate)")
      .neq("id", imp.id)
      .limit(1);
    if (dupes?.length) {
      await setStatus(supabase, imp.id, {
        status: "duplicate",
        error_message: `This conversation was already imported on ${new Date(dupes[0].created_at).toLocaleDateString("en-GB")}.`,
        file_names: fileNames,
      });
      return { status: "duplicate" as const, duplicateOf: dupes[0].id as string };
    }

    const parsed = chats.length
      ? parseWhatsAppChat(chats.map((c) => c.text).join("\n"), { timezoneOffsetMinutes })
      : { messages: [], warnings: ["No chat text file: screenshots will be analysed on their own."], participants: [] };
    warnings.push(...parsed.warnings);

    // Store original messages (batched to stay well within request limits).
    const seqToId = new Map<number, string>();
    for (let i = 0; i < parsed.messages.length; i += 500) {
      const rows = parsed.messages.slice(i, i + 500).map((m) => ({
        import_id: imp.id,
        project_id: imp.project_id,
        seq: m.seq,
        sender: m.sender,
        sent_at: m.sentAt,
        raw_timestamp: m.rawTimestamp,
        body: m.body,
        is_system: m.isSystem,
        attachment_name: m.attachmentName,
        attachment_missing: m.attachmentOmitted,
      }));
      const { data, error } = await supabase.from("source_messages").insert(rows).select("id, seq");
      if (error) throw error;
      for (const r of data) seqToId.set(r.seq, r.id);
    }

    // Match media to messages and store each file as evidence.
    const match = matchMedia(
      parsed.messages,
      media.map((m) => ({ name: m.name, size: m.bytes.byteLength, mimeType: m.mime })),
      timezoneOffsetMinutes,
    );
    const fileToSeq = new Map([...match.bySeq].map(([seq, name]) => [name, seq]));
    const usedPaths = new Set<string>();
    for (const file of media) {
      let safe = sanitizeFileName(file.name);
      while (usedPaths.has(safe)) safe = `1_${safe}`;
      usedPaths.add(safe);
      const path = `${imp.project_id}/imports/${imp.id}/media/${safe}`;
      const { error: upError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file.bytes, { contentType: file.mime, upsert: true });
      if (upError) {
        warnings.push(`${file.name}: could not be stored (${upError.message})`);
        continue;
      }
      const seq = fileToSeq.get(file.name);
      const { error } = await supabase.from("attachments").insert({
        project_id: imp.project_id,
        import_id: imp.id,
        source_message_id: seq ? seqToId.get(seq) : null,
        storage_path: path,
        file_name: file.name,
        mime_type: file.mime,
        size_bytes: file.bytes.byteLength,
        uploaded_by: userId,
      });
      if (error) throw error;
    }

    if (match.missing.length) {
      const ids = match.missing.map((s) => seqToId.get(s)).filter(Boolean) as string[];
      if (ids.length) await supabase.from("source_messages").update({ attachment_missing: true }).in("id", ids);
      warnings.push(`${match.missing.length} referenced attachment(s) were not included in the upload.`);
    }
    if (match.unmatched.length) {
      warnings.push(`${match.unmatched.length} file(s) could not be linked to a message and are kept as loose evidence.`);
    }

    await setStatus(supabase, imp.id, {
      status: "parsed",
      content_hash: contentHash,
      file_names: fileNames,
      message_count: parsed.messages.length,
      media_count: media.length,
      parse_warnings: warnings,
    });
    await supabase.rpc("log_audit_event", {
      p_action: "import.parsed",
      p_details: { entity_id: imp.id, project_id: imp.project_id, messages: parsed.messages.length, media: media.length },
    });
    return { status: "parsed" as const, messages: parsed.messages.length, media: media.length, warnings };
  } catch (err) {
    const message =
      err instanceof ImportError || err instanceof WhatsAppParseError
        ? err.message
        : (err as { code?: string })?.code === "23505"
          ? "This conversation was already imported into this project."
          : "The import could not be processed. Check the file and try again.";
    if (!(err instanceof ImportError || err instanceof WhatsAppParseError)) console.error("[import parse]", err);
    await setStatus(supabase, imp.id, { status: "failed", error_message: message }).catch(() => {});
    throw new ImportError(message);
  }
}

/** Steps 7–8: run the configured AI provider and store issue drafts for review. */
export async function processImport(supabase: SupabaseClient, importId: string, userId: string) {
  const imp = await loadImport(supabase, importId);
  const retryable = imp.status === "failed" && (imp.message_count > 0 || imp.media_count > 0);
  if (imp.status !== "parsed" && !retryable) {
    throw new ImportError(
      imp.status === "review" || imp.status === "completed"
        ? "AI processing has already run for this import"
        : "Parse the import before running AI processing",
    );
  }

  // Rate limit (database-backed so it works across serverless instances).
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await supabase
    .from("imports")
    .select("id", { count: "exact", head: true })
    .eq("created_by", userId)
    .not("ai_provider", "is", null)
    .gte("updated_at", since);
  if ((count ?? 0) >= AI_RUNS_PER_HOUR) {
    throw new ImportError(`AI processing is limited to ${AI_RUNS_PER_HOUR} imports per hour. Please try again later.`);
  }

  const provider = getAIProvider();
  if (retryable) {
    // A previous run failed part-way: discard its partial drafts before retrying.
    await supabase.from("issue_drafts").delete().eq("import_id", imp.id).eq("status", "pending");
  }
  await setStatus(supabase, imp.id, { status: "processing", error_message: null });

  try {
    const [{ data: project }, { data: messages }, { data: attachments }, { data: existing }] = await Promise.all([
      supabase.from("projects").select("id, key, name").eq("id", imp.project_id).single(),
      supabase.from("source_messages").select("*").eq("import_id", imp.id).eq("is_system", false).order("seq"),
      supabase.from("attachments").select("*").eq("import_id", imp.id),
      supabase
        .from("issues")
        .select("id, number, title, description, status")
        .eq("project_id", imp.project_id)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);
    if (!project) throw new ImportError("Project not found");

    // Opaque refs keep database ids out of the prompt.
    const attRef = new Map<string, string>(); // attachment id -> "aN"
    const refToAtt = new Map<string, string>();
    const toExtraction = async (a: NonNullable<typeof attachments>[number]): Promise<ExtractionAttachment> => {
      const ref = `a${attRef.size + 1}`;
      attRef.set(a.id, ref);
      refToAtt.set(ref, a.id);
      const kind = a.mime_type.startsWith("image/") ? "image" : a.mime_type.startsWith("audio/") ? "audio" : a.mime_type.startsWith("video/") ? "video" : "document";
      let base64: string | undefined;
      if (provider.info.supportsVision && kind === "image" && a.size_bytes <= 20 * 1024 * 1024) {
        const { data: blob } = await supabase.storage.from(BUCKET).download(a.storage_path);
        if (blob) base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
      }
      return { ref, fileName: a.file_name, mimeType: a.mime_type, kind, base64 };
    };

    const byMessage = new Map((attachments ?? []).filter((a) => a.source_message_id).map((a) => [a.source_message_id as string, a]));
    const msgRefToId = new Map<string, string>();
    const extractionMessages: ExtractionInput["messages"] = [];
    for (const m of messages ?? []) {
      const ref = `m${m.seq}`;
      msgRefToId.set(ref, m.id);
      const att = byMessage.get(m.id);
      extractionMessages.push({
        ref,
        sender: m.sender,
        sentAt: m.sent_at,
        text: m.body,
        attachment: att ? await toExtraction(att) : undefined,
      });
    }
    const loose: ExtractionAttachment[] = [];
    for (const a of (attachments ?? []).filter((x) => !x.source_message_id)) loose.push(await toExtraction(a));

    const existingRefs = (existing ?? []).map((i) => ({
      id: i.id as string,
      key: `${project.key}-${i.number}`,
      title: i.title as string,
      description: (i.description as string) ?? "",
      status: i.status as string,
    }));

    const outcome = await runExtraction(
      provider,
      {
        projectName: project.name,
        messages: extractionMessages,
        looseAttachments: loose,
        existingIssues: existingRefs.map(({ key, title, status }) => ({ key, title, status })),
      },
      existingRefs,
    );

    // Insert drafts, then resolve draft-to-draft duplicate references to real ids.
    const draftIds: string[] = [];
    for (const d of outcome.drafts) {
      const { data, error } = await supabase
        .from("issue_drafts")
        .insert({
          import_id: imp.id,
          project_id: imp.project_id,
          title: d.title,
          description: d.description,
          category: d.category,
          priority: d.priority,
          reported_by: d.reportedBy,
          reported_at: d.reportedAt,
          suggested_assignee: d.suggestedAssignee,
          confidence: d.confidence,
          source_message_ids: d.messageRefs.map((r) => msgRefToId.get(r)).filter(Boolean),
          attachment_ids: d.attachmentRefs.map((r) => refToAtt.get(r)).filter(Boolean),
          duplicate_candidates: d.duplicateCandidates.filter((c) => c.type === "issue"),
          ai_provider: provider.info.name,
          ai_model: provider.info.model,
          is_simulated: provider.info.simulated,
          raw_output: { prompt_version: PROMPT_VERSION, ai_result: d },
        })
        .select("id")
        .single();
      if (error) throw error;
      draftIds.push(data.id);
    }
    for (let i = 0; i < outcome.drafts.length; i++) {
      const draftDupes = outcome.drafts[i].duplicateCandidates.filter((c) => c.type === "draft");
      if (!draftDupes.length) continue;
      const all = outcome.drafts[i].duplicateCandidates.map((c) =>
        c.type === "draft" ? { ...c, id: draftIds[Number(c.id)] } : c,
      );
      await supabase.from("issue_drafts").update({ duplicate_candidates: all }).eq("id", draftIds[i]);
    }

    for (const [ref, description] of Object.entries(outcome.findings)) {
      const id = refToAtt.get(ref);
      if (id) await supabase.from("attachments").update({ ai_description: description }).eq("id", id);
    }

    await setStatus(supabase, imp.id, {
      status: draftIds.length ? "review" : "completed",
      completed_at: draftIds.length ? null : new Date().toISOString(),
      draft_count: draftIds.length,
      ai_provider: provider.info.name,
      ai_model: provider.info.model,
      ai_simulated: provider.info.simulated,
      parse_warnings: [...(imp.parse_warnings ?? []), ...outcome.warnings],
    });
    await supabase.rpc("log_audit_event", {
      p_action: "import.ai_processed",
      p_details: {
        entity_id: imp.id,
        project_id: imp.project_id,
        provider: provider.info.name,
        model: provider.info.model,
        simulated: provider.info.simulated,
        drafts: draftIds.length,
        batches: outcome.batches,
      },
    });
    return { drafts: draftIds.length, provider: provider.info };
  } catch (err) {
    const message =
      err instanceof ImportError || err instanceof AIProviderError
        ? err.message
        : err instanceof AIOutputError
          ? "The AI response could not be validated, so no drafts were created. Please retry."
          : "AI processing failed. Please try again.";
    if (!(err instanceof ImportError)) console.error("[import process]", err);
    await setStatus(supabase, imp.id, { status: "failed", error_message: message }).catch(() => {});
    throw new ImportError(message);
  }
}
