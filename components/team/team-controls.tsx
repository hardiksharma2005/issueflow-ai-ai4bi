"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Mail, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/shared/confirm-action";
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
import { inviteUser, removeUser, updateRole } from "@/lib/actions/team";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/domain";

export function RoleSelect({ userId, role, disabled }: { userId: string; role: Role; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select
      value={role}
      disabled={disabled || pending}
      onValueChange={(v) =>
        start(async () => {
          const res = await updateRole({ userId, role: v });
          if (res.ok) toast.success(res.message);
          else toast.error(res.error);
          router.refresh();
        })
      }
    >
      <SelectTrigger className="h-8 w-32" aria-label="Role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE_LABELS[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RemoveUserButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${name}`}>
          <UserMinus />
        </Button>
      }
      title={`Remove ${name}?`}
      description="Their account is deleted and they lose access immediately. Issues they created or were assigned keep their history."
      confirmLabel="Remove user"
      onConfirm={() => removeUser(userId)}
      onDone={() => router.refresh()}
    />
  );
}

export function InviteDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>("member");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Mail /> Invite member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>Supabase sends them an email to set a password. Add them to projects after they join.</DialogDescription>
        </DialogHeader>
        <form
          className="grid grid-cols-1 gap-4"
          action={(form) =>
            start(async () => {
              const res = await inviteUser({ email: form.get("email"), fullName: form.get("fullName"), role });
              if (res.ok) {
                toast.success(res.message);
                setOpen(false);
                router.refresh();
              } else toast.error(res.error);
            })
          }
        >
          <div className="grid grid-cols-1 gap-1.5">
            <Label htmlFor="invite-name">Full name</Label>
            <Input id="invite-name" name="fullName" maxLength={120} />
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" name="email" type="email" required />
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
