"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateIssue } from "@/lib/actions/issues";

/** Title + description, editable in place by managers. Rendered as plain text (no HTML) to prevent XSS. */
export function IssueEditor({ id, title, description, canEdit }: { id: string; title: string; description: string; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [t, setT] = useState(title);
  const [d, setD] = useState(description);

  if (!editing) {
    return (
      <div className="group">
        <div className="flex items-start gap-2">
          <h1 className="flex-1 text-xl font-semibold tracking-tight">{title}</h1>
          {canEdit && (
            <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)} aria-label="Edit title and description">
              <Pencil />
            </Button>
          )}
        </div>
        <div className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
          {description || <span className="text-muted-foreground">No description.</span>}
        </div>
      </div>
    );
  }

  return (
    <form
      className="grid grid-cols-1 gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await updateIssue({ id, title: t, description: d });
          if (res.ok) {
            toast.success(res.message);
            setEditing(false);
            router.refresh();
          } else toast.error(res.error);
        });
      }}
    >
      <Input value={t} onChange={(e) => setT(e.target.value)} maxLength={200} required aria-label="Title" className="text-base font-semibold" />
      <Textarea value={d} onChange={(e) => setD(e.target.value)} rows={8} maxLength={20000} aria-label="Description" />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setT(title);
            setD(description);
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
