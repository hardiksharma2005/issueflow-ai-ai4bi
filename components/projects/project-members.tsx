"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { RoleBadge } from "@/components/shared/badges";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addProjectMember, removeProjectMember } from "@/lib/actions/projects";
import type { Profile } from "@/types/db";

type Person = Pick<Profile, "id" | "full_name" | "email" | "role">;

export function ProjectMembers({
  projectId,
  members,
  candidates,
  canManage,
}: {
  projectId: string;
  members: Person[];
  candidates: Person[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [pending, start] = useTransition();
  const available = candidates.filter((c) => !members.some((m) => m.id === c.id));

  return (
    <div className="grid grid-cols-1 gap-4">
      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selected} onValueChange={setSelected} disabled={available.length === 0}>
            <SelectTrigger className="h-8 w-64" aria-label="Choose a person to add">
              <SelectValue placeholder={available.length ? "Add a team member…" : "Everyone is already a member"} />
            </SelectTrigger>
            <SelectContent>
              {available.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!selected || pending}
            onClick={() =>
              start(async () => {
                const res = await addProjectMember({ projectId, userId: selected });
                if (res.ok) {
                  toast.success(res.message);
                  setSelected("");
                  router.refresh();
                } else toast.error(res.error);
              })
            }
          >
            <UserPlus /> Add
          </Button>
        </div>
      )}
      <ul className="divide-y rounded-lg border">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-3 py-2">
            <UserAvatar name={m.full_name || m.email} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{m.full_name || m.email}</div>
              <div className="truncate text-xs text-muted-foreground">{m.email}</div>
            </div>
            <RoleBadge role={m.role} />
            {canManage && (
              <ConfirmAction
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.full_name || m.email}`}>
                    <UserMinus />
                  </Button>
                }
                title="Remove member?"
                description={`${m.full_name || m.email} will lose access to this project's issues and imports.`}
                confirmLabel="Remove"
                onConfirm={() => removeProjectMember({ projectId, userId: m.id })}
                onDone={() => router.refresh()}
              />
            )}
          </li>
        ))}
        {members.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No members yet.</li>}
      </ul>
    </div>
  );
}
