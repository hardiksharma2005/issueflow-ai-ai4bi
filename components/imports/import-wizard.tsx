"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CheckCircle2, FileArchive, FileImage, FileText, Loader2, Sparkles, Upload, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createImport } from "@/lib/actions/imports";
import { formatBytes } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { MAX_IMPORT_FILES, MAX_IMPORT_TOTAL_BYTES, checkFile } from "@/lib/validation/files";
import { cn } from "@/lib/utils";

const STEPS = ["Project", "Upload", "Validate", "Extract", "Preview"] as const;
const SAMPLE_FILES = ["WhatsApp Chat with Bloom Retail Support.zip", "slow-category-page-load.png"];

type Phase = "select" | "uploading" | "parsing" | "done";

export function ImportWizard({ projects, defaultProjectId }: { projects: { id: string; name: string; key: string }[]; defaultProjectId?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [projectId, setProjectId] = useState(defaultProjectId ?? (projects.length === 1 ? projects[0].id : ""));
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>("select");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const checks = files.map((f) => ({ file: f, ...checkFile(f.name, f.size) }));
  const total = files.reduce((s, f) => s + f.size, 0);
  const hasChat = files.some((f) => /\.(txt|zip)$/i.test(f.name));
  const problems = [
    ...checks.filter((c) => !c.ok).map((c) => c.error!),
    ...(files.length > MAX_IMPORT_FILES ? [`At most ${MAX_IMPORT_FILES} files`] : []),
    ...(total > MAX_IMPORT_TOTAL_BYTES ? ["Files exceed 100 MB in total"] : []),
  ];
  const step = phase === "done" ? 4 : phase === "parsing" ? 3 : files.length ? 2 : projectId ? 1 : 0;
  const busy = phase === "uploading" || phase === "parsing";

  const addFiles = (list: FileList | File[]) => {
    const incoming = Array.from(list);
    setFiles((prev) => [...prev.filter((p) => !incoming.some((i) => i.name === p.name)), ...incoming]);
    setError(null);
  };

  const loadSample = async () => {
    try {
      const loaded = await Promise.all(
        SAMPLE_FILES.map(async (name) => {
          const res = await fetch(`/demo/${encodeURIComponent(name)}`);
          if (!res.ok) throw new Error(`Could not load ${name}`);
          const blob = await res.blob();
          return new File([blob], name, { type: blob.type });
        }),
      );
      addFiles(loaded);
      toast.success("Sample WhatsApp export added");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const start = async () => {
    setError(null);
    setPhase("uploading");
    try {
      const created = await createImport({ projectId, files: files.map((f) => ({ name: f.name, size: f.size })) });
      if (!created.ok) throw new Error(created.error);
      const { importId, uploads } = created.data;

      // Direct-to-storage upload (bypasses the 4.5 MB serverless body limit; RLS-protected path).
      const supabase = createClient();
      for (const [i, up] of uploads.entries()) {
        setProgress(`Uploading ${i + 1} of ${uploads.length}: ${up.name}`);
        const file = files.find((f) => f.name === up.name)!;
        const { error: upError } = await supabase.storage
          .from("evidence")
          .upload(up.path, file, { contentType: checkFile(file.name, file.size).info?.mime, upsert: false });
        if (upError) throw new Error(`${up.name}: ${upError.message}`);
      }

      setPhase("parsing");
      setProgress("Extracting messages and matching media…");
      const res = await fetch(`/api/imports/${importId}/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezoneOffsetMinutes: new Date().getTimezoneOffset() }),
      });
      const body = await res.json();
      if (!res.ok) {
        // The import record exists; take the user there so the failure is visible and retryable.
        toast.error(body.error ?? "Import failed");
        router.push(`/imports/${importId}`);
        return;
      }
      setPhase("done");
      if (body.status === "duplicate") toast.warning("This conversation was already imported");
      else toast.success(`${body.messages} messages and ${body.media} file(s) extracted`);
      router.push(`/imports/${importId}`);
    } catch (e) {
      setError((e as Error).message);
      setPhase("select");
    }
  };

  return (
    <div className="grid gap-6">
      <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label="Import steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border font-medium tabular-nums",
                i < step && "border-primary bg-primary text-primary-foreground",
                i === step && "border-primary text-primary",
                i > step && "text-muted-foreground",
              )}
              aria-current={i === step ? "step" : undefined}
            >
              {i < step ? <CheckCircle2 className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={cn(i === step ? "font-medium text-foreground" : "text-muted-foreground")}>{s}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden />}
          </li>
        ))}
      </ol>

      <section className="grid gap-2 rounded-xl border bg-card p-5">
        <Label htmlFor="project">1. Project</Label>
        <Select value={projectId} onValueChange={setProjectId} disabled={busy}>
          <SelectTrigger id="project" className="w-full sm:w-80">
            <SelectValue placeholder="Choose a project" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.key} · {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Only projects you manage are listed.</p>
      </section>

      <section className={cn("grid gap-4 rounded-xl border bg-card p-5", !projectId && "pointer-events-none opacity-50")} inert={!projectId}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium">2. Upload files</h2>
            <p className="text-xs text-muted-foreground">WhatsApp .txt export, .zip export with media, screenshots (PNG/JPG/WebP) and documents. Max 25 MB per file.</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadSample} disabled={busy}>
            <Sparkles /> Use sample WhatsApp data
          </Button>
        </div>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy) addFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragging && "border-primary bg-primary/5",
          )}
        >
          <Upload className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm">
            Drag files here, or{" "}
            <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => input.current?.click()} disabled={busy}>
              browse
            </button>
          </p>
          <p className="text-xs text-muted-foreground">In WhatsApp: open the chat → ⋮ → More → Export chat → Include media</p>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            accept=".txt,.zip,.png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.csv,.opus,.ogg,.mp3,.m4a,.mp4"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <div className="grid gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">3. Validation</h3>
            <ul className="divide-y rounded-lg border">
              {checks.map((c) => {
                const Icon = /\.zip$/i.test(c.file.name) ? FileArchive : /\.(png|jpe?g|webp|gif)$/i.test(c.file.name) ? FileImage : FileText;
                return (
                  <li key={c.file.name} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{c.file.name}</span>
                    <span className="text-xs text-muted-foreground">{formatBytes(c.file.size)}</span>
                    {c.ok ? (
                      <CheckCircle2 className="size-4 text-[var(--status-resolved)]" aria-label="Valid" />
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-destructive">
                        <XCircle className="size-4" aria-hidden /> {c.error?.split(": ")[1]}
                      </span>
                    )}
                    <Button variant="ghost" size="icon-xs" onClick={() => setFiles((f) => f.filter((x) => x !== c.file))} disabled={busy} aria-label={`Remove ${c.file.name}`}>
                      <X />
                    </Button>
                  </li>
                );
              })}
            </ul>
            {!hasChat && <p className="text-xs text-muted-foreground">No chat file selected — screenshots will be analysed on their own.</p>}
          </div>
        )}

        {problems.length > 0 && (
          <Alert variant="destructive">
            <XCircle aria-hidden />
            <AlertDescription>{problems.join(" · ")}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" role="alert">
            <XCircle aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-end gap-3">
          {busy && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden /> {progress}
            </span>
          )}
          <Button onClick={start} disabled={!projectId || files.length === 0 || problems.length > 0 || busy}>
            {busy ? "Working…" : "Upload & extract messages"}
          </Button>
        </div>
      </section>
    </div>
  );
}
