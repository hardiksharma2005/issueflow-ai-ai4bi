"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { Button } from "@/components/ui/button";
import { deleteIssue } from "@/lib/actions/issues";

export function DeleteIssueButton({ issueId, issueKey, projectId }: { issueId: string; issueKey: string; projectId: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      trigger={
        <Button variant="destructive" size="sm" className="w-full">
          <Trash2 /> Delete issue
        </Button>
      }
      title={`Delete ${issueKey}?`}
      description="The issue, its comments, activity history and attachments will be permanently deleted. Source WhatsApp messages are kept in their import."
      confirmLabel="Delete issue"
      requireText={issueKey}
      onConfirm={() => deleteIssue(issueId)}
      onDone={() => router.push(`/projects/${projectId}`)}
    />
  );
}
