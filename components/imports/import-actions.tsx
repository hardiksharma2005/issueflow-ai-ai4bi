"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bot, FlaskConical, Loader2, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { Button } from "@/components/ui/button";
import { deleteImport } from "@/lib/actions/imports";

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json;
}

export function ProcessPanel({
  importId,
  provider,
}: {
  importId: string;
  provider: { name: string; label: string; model: string; configured: boolean; missing: string; simulated: boolean; supportsVision: boolean };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {provider.simulated ? <FlaskConical className="size-5" aria-hidden /> : <Bot className="size-5" aria-hidden />}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-medium">Step 7 · Generate issue drafts with AI</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {provider.simulated ? (
            <>
              Demo mode: the <strong>MockAIProvider</strong> runs deterministic rules locally. No AI model is called, no cost, and results are labelled
              “Simulated”.
            </>
          ) : provider.configured ? (
            <>
              Uses {provider.label} <strong>{provider.model}</strong> through the server. The conversation is treated as untrusted data and every response is validated.{" "}
              {provider.name === "groq"
                ? "Screenshots are not analysed by this model. Large chats are processed in batches within the free plan's rate limits."
                : "API usage is billed by xAI."}
            </>
          ) : (
            <>AI is not configured: {provider.missing}. Ask an admin to fix it or switch to mock mode.</>
          )}
        </p>
      </div>
      <Button
        disabled={busy || !provider.configured}
        onClick={async () => {
          setBusy(true);
          try {
            const res = await post(`/api/imports/${importId}/process`);
            toast.success(`${res.drafts} issue draft(s) ready for review`);
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
            router.refresh();
          }
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {busy ? "Analysing conversation…" : "Process with AI"}
      </Button>
    </div>
  );
}

export function RetryButton({ importId, mode }: { importId: string; mode: "parse" | "process" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await post(`/api/imports/${importId}/${mode}`, mode === "parse" ? { timezoneOffsetMinutes: new Date().getTimezoneOffset() } : undefined);
          toast.success(mode === "parse" ? "Messages extracted" : "Drafts generated");
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
          router.refresh();
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />} {mode === "parse" ? "Retry extraction" : "Retry AI processing"}
    </Button>
  );
}

export function DeleteImportButton({ importId }: { importId: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      trigger={
        <Button variant="ghost" size="icon" aria-label="Delete import">
          <Trash2 />
        </Button>
      }
      title="Delete this import?"
      description="Source messages, pending drafts and files not linked to an approved issue will be deleted. Approved issues and their evidence are kept."
      confirmLabel="Delete import"
      onConfirm={() => deleteImport(importId)}
      onDone={() => router.push("/imports")}
    />
  );
}
