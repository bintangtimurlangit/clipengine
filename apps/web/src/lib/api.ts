/**
 * Typed API client.
 *
 * Calls go through `/api-engine/*` which Next.js rewrites to the
 * Hono backend. Cookies are sent automatically because the proxy is
 * same-origin.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: ApiOptions = {},
): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...opts.headers,
    },
    signal: opts.signal,
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`/api-engine${path}`, init);
  if (!res.ok) {
    let detail: string;
    try {
      const json = (await res.json()) as { error?: { message?: string } };
      detail = json.error?.message ?? `${res.status} ${res.statusText}`;
    } catch {
      detail = await res.text().catch(() => `${res.status} ${res.statusText}`);
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, opts?: ApiOptions) => request<T>('GET', path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: ApiOptions) =>
    request<T>('POST', path, body, opts),
  patch: <T>(path: string, body?: unknown, opts?: ApiOptions) =>
    request<T>('PATCH', path, body, opts),
  delete: <T>(path: string, opts?: ApiOptions) => request<T>('DELETE', path, undefined, opts),
};
