import { ImageOff, Paperclip } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface MessageView {
  id: string;
  seq: number;
  sender: string | null;
  sent_at: string | null;
  raw_timestamp: string | null;
  body: string;
  is_system: boolean;
  attachment_name: string | null;
  attachment_missing: boolean;
}

/** Original WhatsApp messages, rendered as plain text exactly as imported. */
export function MessageList({ messages, highlight, className }: { messages: MessageView[]; highlight?: Set<string>; className?: string }) {
  return (
    <ol className={cn("grid gap-1.5", className)}>
      {messages.map((m) =>
        m.is_system ? (
          <li key={m.id} className="mx-auto max-w-[90%] rounded-md bg-muted px-2 py-0.5 text-center text-[11px] text-muted-foreground">
            {m.body}
          </li>
        ) : (
          <li
            key={m.id}
            className={cn(
              "rounded-lg border bg-background px-3 py-2 text-sm",
              highlight?.has(m.id) && "border-primary/40 bg-primary/5",
            )}
          >
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="font-medium text-foreground">{m.sender ?? "Unknown sender"}</span>
              <span className="text-muted-foreground" title={m.raw_timestamp ?? undefined}>
                {m.sent_at ? formatDateTime(m.sent_at) : `Unknown date${m.raw_timestamp ? ` (${m.raw_timestamp})` : ""}`}
              </span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">#{m.seq}</span>
            </div>
            {m.body && <p className="mt-0.5 whitespace-pre-wrap break-words">{m.body}</p>}
            {(m.attachment_name || m.attachment_missing) && (
              <p className={cn("mt-1 flex items-center gap-1 text-xs", m.attachment_missing ? "text-[var(--priority-high)]" : "text-muted-foreground")}>
                {m.attachment_missing ? <ImageOff className="size-3" aria-hidden /> : <Paperclip className="size-3" aria-hidden />}
                {m.attachment_name ?? "Media"}
                {m.attachment_missing && " — not included in upload"}
              </p>
            )}
          </li>
        ),
      )}
    </ol>
  );
}
