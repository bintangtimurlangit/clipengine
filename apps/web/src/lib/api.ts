/**
 * API base URLs for the Clip Engine FastAPI service.
 *
 * - Browser: use `publicApiUrl` — defaults to same-origin `/api-engine/*` (proxied by `app/api-engine/[...path]/route.ts`).
 * - Server (RSC, route handlers): use `serverApiBase()` + path (no rewrite from Node).
 */

export function publicApiUrl(path: string): string {
  const pub = process.env.NEXT_PUBLIC_API_URL;
  const p = path.startsWith("/") ? path : `/${path}`;
  if (pub) {
    return `${pub.replace(/\/$/, "")}${p}`;
  }
  return `/api-engine${p}`;
}

export function serverApiBase(): string {
  return (process.env.API_INTERNAL_URL || "http://127.0.0.1:8000").replace(
    /\/$/,
    "",
  );
}

/**
 * WebSocket URL for the same API host as ``NEXT_PUBLIC_API_URL`` (browser only).
 * When unset, the UI uses HTTP polling for run logs (Next.js proxy does not upgrade WS).
 */
export function publicWsUrl(path: string): string | null {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (!raw || !String(raw).trim()) return null;
  try {
    const u = new URL(String(raw).trim());
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${u.origin}${p}`;
  } catch {
    return null;
  }
}
