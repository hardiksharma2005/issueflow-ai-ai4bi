"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { runAutomationNow, updateAutomation } from "@/lib/actions/automations";

export function RunNowButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await runAutomationNow(jobId);
          if (res.ok) toast.success(res.message ?? "Run complete");
          else toast.error(res.error);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Play />} Run now
    </Button>
  );
}

export function EnabledSwitch({ jobId, enabled }: { jobId: string; enabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <Switch
        checked={enabled}
        disabled={pending}
        onCheckedChange={(v) =>
          start(async () => {
            const res = await updateAutomation({ jobId, enabled: v });
            if (res.ok) toast.success(v ? "Automation enabled" : "Automation paused");
            else toast.error(res.error);
            router.refresh();
          })
        }
      />
      {enabled ? "Enabled" : "Paused"}
    </label>
  );
}

export function NumberSetting({ jobId, field, label, value, min, max }: { jobId: string; field: "staleDays" | "lookbackHours"; label: string; value: number; min: number; max: number }) {
  const router = useRouter();
  const [v, setV] = useState(String(value));
  const [pending, start] = useTransition();
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await updateAutomation({ jobId, [field]: v });
          if (res.ok) toast.success(res.message);
          else toast.error(res.error);
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-1 gap-1">
        <Label htmlFor={`${jobId}-${field}`} className="text-xs">
          {label}
        </Label>
        <Input id={`${jobId}-${field}`} type="number" min={min} max={max} value={v} onChange={(e) => setV(e.target.value)} className="h-8 w-24" />
      </div>
      <Button type="submit" size="sm" variant="ghost" disabled={pending || v === String(value)}>
        Save
      </Button>
    </form>
  );
}
