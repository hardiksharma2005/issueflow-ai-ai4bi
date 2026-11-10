"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { FileText, FolderKanban, MessageCircle, MessageSquareText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { searchAll } from "@/lib/actions/search";
import { hitHref, type SearchHit } from "@/lib/search";
import { NAV } from "./nav";

const KIND = {
  project: { label: "Projects", icon: FolderKanban },
  issue: { label: "Issues", icon: FileText },
  comment: { label: "Comments", icon: MessageSquareText },
  message: { label: "WhatsApp messages", icon: MessageCircle },
} as const;

export function CommandSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !isTyping(e.target))) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const t = setTimeout(() => start(async () => setHits(await searchAll(query))), 200);
    return () => clearTimeout(t);
  }, [query]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const groups = (Object.keys(KIND) as SearchHit["kind"][])
    .map((k) => ({ kind: k, items: hits.filter((h) => h.kind === k) }))
    .filter((g) => g.items.length);
  const showHits = query.trim().length >= 2;

  return (
    <>
      <Button
        variant="outline"
        className="h-8 w-full max-w-xs justify-start gap-2 text-muted-foreground sm:w-64"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setQuery("");
            setHits([]);
          }
        }}
        title="Search"
        description="Search projects, issues, comments and WhatsApp messages"
      >
        {/* Results come from the server; disable cmdk's own filtering. */}
        <Command shouldFilter={false}>
        <CommandInput placeholder="Search projects, issues, comments, messages…" value={query} onValueChange={setQuery} />
        <CommandList>
          {showHits && !pending && <CommandEmpty>No results for “{query}”.</CommandEmpty>}
          {showHits && pending && hits.length === 0 && <div className="py-6 text-center text-sm text-muted-foreground">Searching…</div>}
          {!showHits && (
            <CommandGroup heading="Go to">
              {NAV.map((n) => (
                <CommandItem key={n.href} value={n.label} onSelect={() => go(n.href)}>
                  <n.icon aria-hidden />
                  {n.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {showHits &&
            groups.map((g) => {
              const Icon = KIND[g.kind].icon;
              return (
                <CommandGroup key={g.kind} heading={KIND[g.kind].label}>
                  {g.items.map((h) => (
                    <CommandItem key={`${h.kind}-${h.id}`} value={`${h.kind}-${h.id}-${query}`} onSelect={() => go(hitHref(h))}>
                      <Icon aria-hidden />
                      <div className="min-w-0">
                        <div className="truncate">{h.title}</div>
                        {h.snippet && <div className="truncate text-xs text-muted-foreground">{h.snippet}</div>}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          {showHits && hits.length > 0 && (
            <CommandGroup>
              <CommandItem value={`all-${query}`} onSelect={() => go(`/search?q=${encodeURIComponent(query)}`)}>
                <Search aria-hidden />
                See all results for “{query}”
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}
