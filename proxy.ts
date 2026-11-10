import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { normalizeSupabaseUrl } from "@/lib/env";

// Runs before every page request: refreshes the Supabase session cookie and keeps
// signed-out users out of the application. (Authorization is still enforced again
// in the database by RLS — this is only the first gate.)

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/auth", "/setup"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!url || !key) {
    // Not configured yet: send everything to the setup page instead of crashing.
    if (path !== "/setup") return NextResponse.redirect(new URL("/setup", request.url));
    return response;
  }

  const supabase = createServerClient(normalizeSupabaseUrl(url), key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  // getClaims() validates the JWT; do not trust getSession() on the server.
  const { data, error } = await supabase.auth.getClaims();
  // Auth server unreachable: don't treat a signed-in user as signed out. The page's own
  // check fails the same way and shows a retryable error instead of the login form.
  if (error && isAuthRetryableFetchError(error)) return response;
  const signedIn = Boolean(data?.claims?.sub);

  if (!signedIn && !isPublic && path !== "/") {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(login);
  }

  if (signedIn && (path === "/login" || path === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Pages only: API routes do their own auth (and cron uses a bearer secret).
    "/((?!api|_next/static|_next/image|favicon.ico|demo/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|zip)$).*)",
  ],
};
