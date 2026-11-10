"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/actions/result";

/** Confirmation for destructive operations; optionally requires typing a phrase. */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel = "Delete",
  requireText,
  onConfirm,
  onDone,
}: {
  trigger: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  requireText?: string;
  onConfirm: (typed: string) => Promise<ActionResult<unknown>>;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const blocked = Boolean(requireText) && typed.trim().toUpperCase() !== requireText!.toUpperCase();

  return (
    <AlertDialog open={open} onOpenChange={(o) => (setOpen(o), setTyped(""))}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {requireText && (
          <div className="grid gap-2">
            <Label htmlFor="confirm-text">
              Type <span className="font-mono font-semibold">{requireText}</span> to confirm
            </Label>
            <Input id="confirm-text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={blocked || pending}
            onClick={() =>
              start(async () => {
                const res = await onConfirm(typed);
                if (res.ok) {
                  toast.success(res.message ?? "Done");
                  setOpen(false);
                  onDone?.();
                } else toast.error(res.error);
              })
            }
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
