/**
 * fetch for server-side Supabase clients: retries reads once when the connection drops
 * (typically a pooled keep-alive socket the other side already closed → ECONNRESET).
 * Writes are never retried automatically — a write may have been applied before the
 * connection failed; callers surface the error and the user can retry.
 */
export const resilientFetch: typeof fetch = async (input, init) => {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  try {
    return await fetch(input, init);
  } catch (err) {
    if ((method !== "GET" && method !== "HEAD") || init?.signal?.aborted) throw err;
    await new Promise((r) => setTimeout(r, 250));
    return fetch(input, init);
  }
};
