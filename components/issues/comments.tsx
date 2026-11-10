"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addComment, deleteComment } from "@/lib/actions/issues";

export interface CommentView {
  id: string;
  body: string;
  authorId: string | null;
  authorName: string;
  createdLabel: string;
}

export function Comments({ issueId, comments, viewerId, canModerate }: { issueId: string; comments: CommentView[]; viewerId: string; canModerate: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="grid grid-cols-1 gap-4">
      {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet. Start the discussion below.</p>}
      <ul className="grid grid-cols-1 gap-4">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-3">
            <UserAvatar name={c.authorName} size="sm" className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-foreground">{c.authorName}</span>
                <span className="text-muted-foreground">{c.createdLabel}</span>
                {(c.authorId === viewerId || canModerate) && (
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" size="icon-xs" className="ml-auto text-muted-foreground" aria-label="Delete comment">
                        <Trash2 />
                      </Button>
                    }
                    title="Delete comment?"
                    description="The comment will be permanently removed."
                    onConfirm={() => deleteComment(c.id)}
                    onDone={() => router.refresh()}
                  />
                )}
              </div>
              {/* Plain text rendering: user content is never interpreted as HTML. */}
              <p className="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <form
        className="grid grid-cols-1 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const body = ref.current?.value ?? "";
          start(async () => {
            const res = await addComment({ issueId, body });
            if (res.ok) {
              if (ref.current) ref.current.value = "";
              router.refresh();
            } else toast.error(res.error);
          });
        }}
      >
        <Textarea
          ref={ref}
          placeholder="Write a comment…"
          rows={3}
          maxLength={10000}
          aria-label="New comment"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
          }}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Ctrl + Enter to send</span>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Posting…" : "Comment"}
          </Button>
        </div>
      </form>
    </div>
  );
}
