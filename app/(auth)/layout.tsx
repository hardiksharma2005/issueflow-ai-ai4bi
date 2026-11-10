import { FileText, MessageCircle, ShieldCheck, Zap } from "lucide-react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-10">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Zap className="size-4" aria-hidden />
          </span>
          IssueFlow AI
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-xs text-muted-foreground">Turn WhatsApp conversations into tracked work.</p>
      </div>
      <aside className="hidden border-l bg-muted/40 lg:flex lg:flex-col lg:justify-center lg:px-14">
        <div className="max-w-md">
          <h2 className="text-2xl font-semibold tracking-tight">From chat chaos to a clear backlog</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Upload a WhatsApp export and screenshots. IssueFlow AI finds the distinct problems, links the evidence, and
            hands you drafts to approve.
          </p>
          <ul className="mt-8 grid gap-4 text-sm">
            {[
              { icon: MessageCircle, title: "Reads real exports", text: "Android and iOS formats, multiline messages and media." },
              { icon: FileText, title: "Drafts, not decisions", text: "Every AI result is reviewed by a person before it becomes an issue." },
              { icon: ShieldCheck, title: "Secure by default", text: "Role-based access enforced in the database with row-level security." },
            ].map((f) => (
              <li key={f.title} className="flex gap-3 rounded-xl border bg-card p-4">
                <f.icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <div>
                  <div className="font-medium">{f.title}</div>
                  <div className="text-muted-foreground">{f.text}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
