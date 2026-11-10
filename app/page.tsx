import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

// Configuration is checked per request, never frozen into a static build.
export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isSupabaseConfigured()) redirect("/setup");
  const viewer = await getViewer();
  redirect(viewer ? "/dashboard" : "/login");
}
