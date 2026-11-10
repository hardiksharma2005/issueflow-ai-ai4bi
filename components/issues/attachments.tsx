"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileText, Paperclip, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { Button } from "@/components/ui/button";
import { deleteAttachment, registerIssueAttachment } from "@/lib/actions/issues";
import { formatBytes } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { checkFile, sanitizeFileName } from "@/lib/validation/files";

export interface AttachmentView {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string | null;
  aiDescription: string | null;
  canDelete: boolean;
}

export function Attachments({
  issueId,
  projectId,
  attachments,
  canUpload,
}: {
  issueId: string;
  projectId: string;
  attachments: AttachmentView[];
  canUpload: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const supabase = createClient();
    for (const file of Array.from(files)) {
      const check = checkFile(file.name, file.size);
      if (!check.ok || !check.info) {
        toast.error(check.error);
        continue;
      }
      const path = `${projectId}/issues/${issueId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
      const { error } = await supabase.storage.from("evidence").upload(path, file, { contentType: check.info.mime });
      if (error) {
        toast.error(`${file.name}: ${error.message}`);
        continue;
      }
      const res = await registerIssueAttachment({ projectId, issueId, storagePath: path, fileName: file.name });
      if (res.ok) toast.success(`${file.name} uploaded`);
      else toast.error(res.error);
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  };

  return (
    <div className="grid grid-cols-1 gap-3">
      {attachments.length === 0 && <p className="text-sm text-muted-foreground">No attachments.</p>}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {attachments.map((a) => (
          <li key={a.id} className="overflow-hidden rounded-lg border bg-background">
            {a.mimeType.startsWith("image/") && a.url ? (
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="block bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimisable */}
                <img src={a.url} alt={a.fileName} className="h-40 w-full object-contain" loading="lazy" />
              </a>
            ) : (
              <div className="flex h-20 items-center justify-center bg-muted">
                <FileText className="size-6 text-muted-foreground" aria-hidden />
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-2 text-xs">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              {a.url ? (
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-medium hover:underline">
                  {a.fileName}
                </a>
              ) : (
                <span className="min-w-0 flex-1 truncate font-medium">{a.fileName}</span>
              )}
              <span className="text-muted-foreground">{formatBytes(a.sizeBytes)}</span>
              {a.canDelete && (
                <ConfirmAction
                  trigger={
                    <Button variant="ghost" size="icon-xs" aria-label={`Delete ${a.fileName}`}>
                      <Trash2 />
                    </Button>
                  }
                  title="Delete attachment?"
                  description={`${a.fileName} will be permanently deleted.`}
                  onConfirm={() => deleteAttachment(a.id)}
                  onDone={() => router.refresh()}
                />
              )}
            </div>
            {a.aiDescription && (
              <p className="flex gap-1.5 border-t px-3 py-2 text-xs text-muted-foreground">
                <Sparkles className="mt-0.5 size-3 shrink-0" aria-hidden />
                {a.aiDescription}
              </p>
            )}
          </li>
        ))}
      </ul>
      {canUpload && (
        <div>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx"
            onChange={(e) => upload(e.target.files)}
          />
          <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            <Upload /> {busy ? "Uploading…" : "Upload evidence"}
          </Button>
          <span className="ml-2 text-xs text-muted-foreground">Images, PDFs and documents up to 25 MB</span>
        </div>
      )}
    </div>
  );
}
