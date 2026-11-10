const BASE = "http://same.invalid";

/**
 * Returns `next` only if it is a same-origin path, otherwise `fallback` (prevents open
 * redirects via ?next=). Checks the resolved URL rather than the string: "//x", "/\x" and
 * "/<tab>/x" all resolve to another host.
 */
export function safeRedirectPath(next: string | null | undefined, fallback = "/dashboard") {
  if (!next || !next.startsWith("/")) return fallback;
  try {
    return new URL(next, BASE).origin === BASE ? next : fallback;
  } catch {
    return fallback;
  }
}
