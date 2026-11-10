import type { Metadata } from "next";
import Link from "next/link";
import { FileText, FolderKanban, MessageCircle, MessageSquareText, Search } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { searchAll } from "@/lib/actions/search";
import { hitHref, type SearchHit } from "@/lib/search";
import { requireViewer } from "@/lib/auth";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Search" };

const KIND = {
  project: { label: "Projects", icon: FolderKanban },
  issue: { label: "Issues", icon: FileText },
  comment: { label: "Comments", icon: MessageSquareText },
  message: { label: "WhatsApp messages", icon: MessageCircle },
} as const;

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  await requireViewer();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const hits = q ? await searchAll(q, 50) : [];

  return (
    <div className="grid gap-5">
      <PageHeader title="Search" description={q ? `${hits.length} result(s) for “${q}”` : "Search projects, issues, comments and WhatsApp messages."} />
      <form action="/search" className="relative max-w-xl">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          name="q"
          defaultValue={q}
          placeholder="Search everything…"
          className="h-10 w-full rounded-lg border bg-background pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Search"
        />
      </form>
      {q && hits.length === 0 && <EmptyState icon={Search} title="No results" description="Try a different word, an issue key like WEB-12, or a sender's name." />}
      {(Object.keys(KIND) as SearchHit["kind"][]).map((kind) => {
        const items = hits.filter((h) => h.kind === kind);
        if (!items.length) return null;
        const Icon = KIND[kind].icon;
        return (
          <section key={kind} className="rounded-xl border bg-card">
            <h2 className="flex items-center gap-2 border-b px-4 py-2.5 text-sm font-medium">
              <Icon className="size-4 text-muted-foreground" aria-hidden /> {KIND[kind].label} ({items.length})
            </h2>
            <ul className="divide-y">
              {items.map((h) => (
                <li key={h.id}>
                  <Link href={hitHref(h)} className="block px-4 py-2.5 text-sm hover:bg-muted/50">
                    <span className="font-medium">{h.title}</span>
                    {h.snippet && <span className="block truncate text-xs text-muted-foreground">{h.snippet}</span>}
                    <span className="text-[11px] text-muted-foreground">{timeAgo(h.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
