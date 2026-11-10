import type { Metadata } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";
import { ImportStatusBadge, SimulatedBadge } from "@/components/shared/badges";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { ProjectFilter } from "@/components/shared/project-filter";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireViewer } from "@/lib/auth";
import { displayName, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ImportRecord } from "@/types/db";

export const metadata: Metadata = { title: "Imports" };

type Row = ImportRecord & { project: { name: string; key: string } | null; creator: { full_name: string; email: string } | null };

export default async function ImportsPage({ searchParams }: PageProps<"/imports">) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: projects } = await supabase.from("projects").select("id, name").order("name");
  let query = supabase
    .from("imports")
    .select("*, project:projects(name, key), creator:profiles!imports_created_by_fkey(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (typeof sp.project === "string" && projects?.some((p) => p.id === sp.project)) query = query.eq("project_id", sp.project);
  const { data: imports } = await query.returns<Row[]>();

  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader
        title="Imports"
        description="WhatsApp conversations and screenshots processed into issue drafts."
        actions={
          <>
            <ProjectFilter projects={projects ?? []} />
            {viewer.profile.role !== "member" && (
              <Button asChild>
                <Link href="/imports/new">
                  <Upload /> New import
                </Link>
              </Button>
            )}
          </>
        }
      />
      {!imports?.length ? (
        <EmptyState
          icon={Upload}
          title="No imports yet"
          description="Upload a WhatsApp export to turn the conversation into reviewable issue drafts. A sample conversation is included."
          action={
            viewer.profile.role !== "member" && (
              <Button asChild>
                <Link href="/imports/new">Start an import</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Files</TableHead>
                <TableHead className="hidden md:table-cell">Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Messages</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Drafts</TableHead>
                <TableHead className="hidden lg:table-cell">AI</TableHead>
                <TableHead className="hidden lg:table-cell">Imported</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.map((imp) => (
                <TableRow key={imp.id} className="relative">
                  <TableCell className="max-w-72">
                    <Link href={`/imports/${imp.id}`} className="block truncate font-medium after:absolute after:inset-0 hover:text-primary">
                      {imp.file_names.join(", ") || "Upload"}
                    </Link>
                    {imp.error_message && <span className="block truncate text-xs text-destructive">{imp.error_message}</span>}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{imp.project?.name}</TableCell>
                  <TableCell>
                    <ImportStatusBadge status={imp.status} />
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{imp.message_count}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{imp.draft_count}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {imp.ai_simulated ? <SimulatedBadge /> : imp.ai_model ? <span className="text-xs text-muted-foreground">{imp.ai_model}</span> : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                    {formatDateTime(imp.created_at)}
                    <span className="block">{displayName(imp.creator)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
