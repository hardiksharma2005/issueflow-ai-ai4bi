"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Columns3, List, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CATEGORY_LABELS,
  ISSUE_CATEGORIES,
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  PRIORITY_LABELS,
  STATUS_LABELS,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

interface Option {
  value: string;
  label: string;
}

function FilterSelect({ param, label, options, width = "w-36" }: { param: string; label: string; options: Option[]; width?: string }) {
  const { value, set } = useParam(param);
  return (
    <Select value={value ?? "all"} onValueChange={(v) => set(v === "all" ? null : v)}>
      <SelectTrigger className={cn("h-8", width, value && "border-primary/40 bg-primary/5")} aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}: all</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function useParam(param: string) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  return {
    value: search.get(param),
    set(v: string | null) {
      const next = new URLSearchParams(search.toString());
      if (v) next.set(param, v);
      else next.delete(param);
      if (param !== "page") next.delete("page");
      router.push(`${pathname}${next.size ? `?${next}` : ""}`);
    },
  };
}

export function IssueFilters({
  projects,
  people,
  showProject = true,
  showView = true,
  showAssignee = true,
}: {
  projects?: Option[];
  people?: Option[];
  showProject?: boolean;
  showView?: boolean;
  showAssignee?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const q = useParam("q");
  const view = useParam("view");
  const [text, setText] = useState(q.value ?? "");

  // Debounced free-text search.
  useEffect(() => {
    if ((q.value ?? "") === text) return;
    const t = setTimeout(() => q.set(text.trim() || null), 350);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = [...search.keys()].filter((k) => !["view", "page", "sort"].includes(k)).length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search title, description or key…"
          className="h-8 pl-8"
          aria-label="Search issues"
        />
      </div>
      {showProject && projects && <FilterSelect param="project" label="Project" options={projects} width="w-40" />}
      <FilterSelect param="status" label="Status" options={ISSUE_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
      <FilterSelect param="priority" label="Priority" options={ISSUE_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))} />
      <FilterSelect param="category" label="Category" options={ISSUE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))} width="w-40" />
      {showAssignee && people && (
        <FilterSelect
          param="assignee"
          label="Assignee"
          options={[{ value: "me", label: "Me" }, { value: "unassigned", label: "Unassigned" }, ...people]}
          width="w-40"
        />
      )}
      <DateFilter />
      <FilterSelect
        param="sort"
        label="Sort"
        width="w-40"
        options={[
          { value: "created_desc", label: "Newest first" },
          { value: "created_asc", label: "Oldest first" },
          { value: "due_asc", label: "Due date (soonest)" },
          { value: "due_desc", label: "Due date (latest)" },
          { value: "priority", label: "Priority" },
          { value: "updated_desc", label: "Recently updated" },
        ]}
      />
      {active > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setText("");
            const keep = new URLSearchParams();
            if (search.get("view")) keep.set("view", search.get("view")!);
            router.push(`${pathname}${keep.size ? `?${keep}` : ""}`);
          }}
        >
          <X /> Clear ({active})
        </Button>
      )}
      {showView && (
        <div className="ml-auto flex rounded-lg border p-0.5" role="group" aria-label="View">
          <Button variant={view.value !== "board" ? "secondary" : "ghost"} size="xs" onClick={() => view.set(null)} aria-pressed={view.value !== "board"}>
            <List /> Table
          </Button>
          <Button variant={view.value === "board" ? "secondary" : "ghost"} size="xs" onClick={() => view.set("board")} aria-pressed={view.value === "board"}>
            <Columns3 /> Board
          </Button>
        </div>
      )}
    </div>
  );
}

function DateFilter() {
  const from = useParam("from");
  const to = useParam("to");
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <Input type="date" className="h-8 w-36" value={from.value ?? ""} onChange={(e) => from.set(e.target.value || null)} aria-label="Created from" />
      <span>–</span>
      <Input type="date" className="h-8 w-36" value={to.value ?? ""} onChange={(e) => to.set(e.target.value || null)} aria-label="Created to" />
    </div>
  );
}

export function Pagination({ page, pageSize, count }: { page: number; pageSize: number; count: number }) {
  const p = useParam("page");
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (count === 0) return null;
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, count)} of {count}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => p.set(page - 1 > 1 ? String(page - 1) : null)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => p.set(String(page + 1))}>
          Next
        </Button>
      </div>
    </div>
  );
}
