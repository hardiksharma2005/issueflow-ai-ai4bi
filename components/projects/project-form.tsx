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
import { createProject, updateProject } from "@/lib/actions/projects";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/domain";
import type { Project } from "@/types/db";

function suggestKey(name: string) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  const key = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "").slice(0, 4);
  return /^[A-Z]/.test(key) ? key.slice(0, 6) : "";
}

export function ProjectFormDialog({ project, trigger }: { project?: Project; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [name, setName] = useState(project?.name ?? "");
  const [key, setKey] = useState(project?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(Boolean(project));
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "active");

  const submit = (form: FormData) =>
    start(async () => {
      const payload = {
        name,
        key,
        clientName: String(form.get("clientName") ?? ""),
        description: String(form.get("description") ?? ""),
        status,
      };
      const res = project ? await updateProject({ ...payload, id: project.id }) : await createProject(payload);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      setOpen(false);
      if (!project && res.data && typeof res.data === "object" && "id" in res.data) router.push(`/projects/${res.data.id}`);
      else router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>Projects keep issues, imports and members isolated from each other.</DialogDescription>
        </DialogHeader>
        <form action={submit} className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
            <div className="grid grid-cols-1 gap-1.5">
              <Label htmlFor="name">Project name</Label>
              <Input
                id="name"
                value={name}
                required
                maxLength={120}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!keyTouched) setKey(suggestKey(e.target.value));
                }}
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <Label htmlFor="key">Key</Label>
              <Input
                id="key"
                value={key}
                disabled={Boolean(project)}
                maxLength={10}
                className="font-mono uppercase"
                onChange={(e) => {
                  setKeyTouched(true);
                  setKey(e.target.value.toUpperCase());
                }}
                aria-invalid={Boolean(errors.key)}
                aria-describedby="key-help"
              />
              <p id="key-help" className="text-xs text-muted-foreground">
                {errors.key ?? "Prefix for issue IDs"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label htmlFor="clientName">Client or organisation</Label>
            <Input id="clientName" name="clientName" defaultValue={project?.client_name ?? ""} maxLength={120} />
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" defaultValue={project?.description ?? ""} rows={3} maxLength={5000} />
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {PROJECT_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : project ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
