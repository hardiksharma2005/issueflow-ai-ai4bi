import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar, type Notification } from "@/components/app-shell/topbar";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UNRESOLVED_STATUSES } from "@/lib/domain";
import { daysAgoIso } from "@/lib/format";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const isManager = viewer.profile.role !== "member";

  const [myOpen, overdue, review, failed] = await Promise.all([
    supabase
      .from("issues")
      .select("id", { count: "exact", head: true })
      .eq("assignee_id", viewer.id)
      .in("status", UNRESOLVED_STATUSES),
    supabase
      .from("issues")
      .select("id, number, title, due_date, project:projects(key)")
      .eq("assignee_id", viewer.id)
      .in("status", UNRESOLVED_STATUSES)
      .lt("due_date", today)
      .order("due_date")
      .limit(5),
    isManager
      ? supabase.from("imports").select("id, draft_count, project:projects(name)").eq("status", "review").limit(5)
      : Promise.resolve({ data: [] }),
    isManager
      ? supabase
          .from("imports")
          .select("id, error_message, project:projects(name)")
          .eq("status", "failed")
          .gte("updated_at", daysAgoIso(7))
          .limit(5)
      : Promise.resolve({ data: [] }),
  ]);

  const notifications: Notification[] = [
    ...(overdue.data ?? []).map((i) => ({
      id: `overdue-${i.id}`,
      title: `Overdue: ${(i.project as unknown as { key: string } | null)?.key}-${i.number}`,
      detail: i.title,
      href: `/issues/${i.id}`,
      tone: "danger" as const,
    })),
    ...((review.data ?? []) as { id: string; draft_count: number; project: unknown }[]).map((i) => ({
      id: `review-${i.id}`,
      title: "Import needs review",
      detail: `${i.draft_count} AI draft(s) · ${(i.project as { name: string } | null)?.name ?? ""}`,
      href: `/imports/${i.id}`,
      tone: "info" as const,
    })),
    ...((failed.data ?? []) as { id: string; error_message: string | null; project: unknown }[]).map((i) => ({
      id: `failed-${i.id}`,
      title: "Import failed",
      detail: i.error_message ?? (i.project as { name: string } | null)?.name ?? "",
      href: `/imports/${i.id}`,
      tone: "warning" as const,
    })),
  ];

  const badges = {
    "/my-tasks": myOpen.count ?? 0,
    "/imports": (review.data ?? []).length,
  };

  return (
    <div className="flex min-h-svh">
      <Sidebar badges={badges} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={{ name: viewer.profile.full_name || viewer.email, email: viewer.email, role: viewer.profile.role }}
          notifications={notifications}
          badges={badges}
        />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}
