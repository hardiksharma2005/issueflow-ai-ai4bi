"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createIssue } from "@/lib/actions/issues";
import {
  CATEGORY_LABELS,
  ISSUE_CATEGORIES,
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  PRIORITY_LABELS,
  STATUS_LABELS,
} from "@/lib/domain";

export interface ProjectOption {
  id: string;
  key: string;
  name: string;
  members: { id: string; name: string }[];
}

function LabeledSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="grid grid-cols-1 gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function NewIssueDialog({ projects, defaultProjectId, trigger }: { projects: ProjectOption[]; defaultProjectId?: string; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? "");
  const [category, setCategory] = useState("bug");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("open");
  const [assignee, setAssignee] = useState("none");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const members = projects.find((p) => p.id === projectId)?.members ?? [];

  const submit = (form: FormData) =>
    start(async () => {
      const res = await createIssue({
        projectId,
        title: form.get("title"),
        description: form.get("description"),
        category,
        priority,
        status,
        assigneeId: assignee,
        dueDate: form.get("dueDate"),
        reporterName: form.get("reporterName"),
      });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      setOpen(false);
      router.push(`/issues/${res.data.id}`);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New issue</DialogTitle>
          <DialogDescription>Create an issue manually. Imported issues are created from reviewed AI drafts instead.</DialogDescription>
        </DialogHeader>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">You need to manage at least one project to create issues.</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(new FormData(e.currentTarget));
            }}
            className="grid grid-cols-1 gap-4"
          >
            <LabeledSelect
              label="Project"
              value={projectId}
              onChange={(v) => {
                setProjectId(v);
                setAssignee("none");
              }}
              options={projects.map((p) => ({ value: p.id, label: `${p.key} · ${p.name}` }))}
            />
            <div className="grid grid-cols-1 gap-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required maxLength={200} aria-invalid={Boolean(errors.title)} />
              {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" rows={4} maxLength={20000} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <LabeledSelect label="Category" value={category} onChange={setCategory} options={ISSUE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))} />
              <LabeledSelect label="Priority" value={priority} onChange={setPriority} options={ISSUE_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))} />
              <LabeledSelect label="Status" value={status} onChange={setStatus} options={ISSUE_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <LabeledSelect label="Assignee" value={assignee} onChange={setAssignee} options={[{ value: "none", label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: m.name }))]} />
              <div className="grid grid-cols-1 gap-1.5">
                <Label htmlFor="dueDate">Due date</Label>
                <Input id="dueDate" name="dueDate" type="date" />
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <Label htmlFor="reporterName">Reported by</Label>
                <Input id="reporterName" name="reporterName" placeholder="Optional" maxLength={120} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create issue"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
