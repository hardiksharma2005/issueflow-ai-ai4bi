"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile } from "@/lib/actions/team";

export function ProfileForm({ fullName, email }: { fullName: string; email: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      className="grid max-w-md gap-4"
      action={(form) =>
        start(async () => {
          const res = await updateProfile({ fullName: form.get("fullName") });
          if (res.ok) toast.success(res.message);
          else toast.error(res.error);
          router.refresh();
        })
      }
    >
      <div className="grid gap-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" defaultValue={fullName} required minLength={2} maxLength={120} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} disabled />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
