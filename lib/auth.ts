import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/domain";
import type { Profile } from "@/types/db";

export interface Viewer {
  id: string;
  email: string;
  profile: Profile;
}

/** Current user + profile, cached per request. Returns null when signed out. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single<Profile>();
  if (!profile) return null;
  return { id: userId, email: profile.email, profile };
});

/** For pages: redirect to /login when signed out. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

export function hasRole(viewer: Viewer, roles: Role[]) {
  return roles.includes(viewer.profile.role);
}

export class AuthError extends Error {
  constructor(
    message = "You are not signed in",
    readonly status = 401,
  ) {
    super(message);
  }
}

/** For server actions / route handlers: throw instead of redirecting. */
export async function assertViewer(roles?: Role[]): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new AuthError();
  if (roles && !hasRole(viewer, roles)) throw new AuthError("You do not have permission to do that", 403);
  return viewer;
}
