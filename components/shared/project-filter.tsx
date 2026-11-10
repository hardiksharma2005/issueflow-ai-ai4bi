"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Project selector that writes ?project= into the URL (server pages re-query). */
export function ProjectFilter({ projects, param = "project" }: { projects: { id: string; name: string }[]; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const value = search.get(param) ?? "all";

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const next = new URLSearchParams(search.toString());
        if (v === "all") next.delete(param);
        else next.set(param, v);
        next.delete("page");
        router.push(`${pathname}${next.size ? `?${next}` : ""}`);
      }}
    >
      <SelectTrigger className="h-8 w-48" aria-label="Filter by project">
        <SelectValue placeholder="All projects" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All projects</SelectItem>
        {projects.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
