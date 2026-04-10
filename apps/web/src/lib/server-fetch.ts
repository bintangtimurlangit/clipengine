/**
 * Bounded server-side fetches for RSC. Without a short timeout, a slow or offline
 * API can block Next.js from sending any HTML for minutes (browser looks "stuck"
 * on localhost:3000).
 */
export const RSC_SERVER_FETCH_MS = 15_000;
export const RSC_SETUP_FETCH_MS = 8_000;

export function serverFetchJsonInit(timeoutMs: number = RSC_SERVER_FETCH_MS): RequestInit {
  return {
    cache: "no-store" as const,
    signal: AbortSignal.timeout(timeoutMs),
  };
}
