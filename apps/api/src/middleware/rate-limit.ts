/**
 * In-process rate limiter.
 *
 * Tracks requests per `(ip, route)` in a Map and rejects with 429
 * once the configured threshold is hit inside the rolling window.
 * Sufficient for the single-admin self-host story; behind a real
 * load balancer you'd run a real limiter (Cloudflare, nginx, etc.).
 *
 * The middleware is intentionally narrow: only auth and onboarding
 * test routes need it. The rest of the API is gated by session
 * cookies and doesn't see anonymous traffic.
 */

import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppBindings } from '../types.js';

interface Bucket {
  /** Remaining tokens. */
  tokens: number;
  /** Wall-clock ms when `tokens` was last refilled. */
  refilledAt: number;
}

export interface RateLimitOptions {
  /** Max requests per window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /**
   * Identifier used to scope the bucket. Defaults to a combination
   * of the request's remote address (X-Forwarded-For first, then
   * the connection IP) and the route path.
   */
  keyFor?: (c: import('hono').Context<AppBindings>) => string;
}

const buckets = new Map<string, Bucket>();

function take(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket) {
    buckets.set(key, { tokens: max - 1, refilledAt: now });
    return true;
  }
  const elapsed = now - bucket.refilledAt;
  if (elapsed >= windowMs) {
    bucket.tokens = max - 1;
    bucket.refilledAt = now;
    return true;
  }
  if (bucket.tokens > 0) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

function defaultKey(c: import('hono').Context<AppBindings>): string {
  const fwd = c.req.header('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0]?.trim() : (c.env as { ip?: string } | undefined)?.ip;
  return `${ip ?? 'unknown'}|${c.req.path}`;
}

/**
 * Build a rate-limit middleware for one route group. Each route
 * gets its own bucket so the limits don't bleed.
 */
export function rateLimit(options: RateLimitOptions): MiddlewareHandler<AppBindings> {
  const keyFor = options.keyFor ?? defaultKey;
  return async (c, next) => {
    const key = keyFor(c);
    if (!take(key, options.max, options.windowMs)) {
      throw new HTTPException(429, {
        message: `rate limit exceeded (${options.max} per ${options.windowMs}ms)`,
      });
    }
    await next();
  };
}

/** Test-only helper: drop the global state between cases. */
export function _resetRateLimitForTests(): void {
  buckets.clear();
}
