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
