import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import { _resetRateLimitForTests, rateLimit } from '../src/middleware/rate-limit.js';
import type { AppBindings } from '../src/types.js';

afterEach(() => _resetRateLimitForTests());

describe('rateLimit', () => {
  it('allows requests up to the limit and rejects the rest', async () => {
    const app = new Hono<AppBindings>();
    app.use('*', rateLimit({ max: 3, windowMs: 10_000 }));
    app.get('/', (c) => c.text('ok'));

    for (let i = 0; i < 3; i++) {
      const res = await app.request('/', {
        headers: { 'x-forwarded-for': '198.51.100.1' },
      });
      expect(res.status).toBe(200);
    }
    const blocked = await app.request('/', {
      headers: { 'x-forwarded-for': '198.51.100.1' },
    });
    expect(blocked.status).toBe(429);
  });

  it('separates buckets per IP', async () => {
    const app = new Hono<AppBindings>();
    app.use('*', rateLimit({ max: 2, windowMs: 10_000 }));
    app.get('/', (c) => c.text('ok'));

    await app.request('/', { headers: { 'x-forwarded-for': '198.51.100.2' } });
    await app.request('/', { headers: { 'x-forwarded-for': '198.51.100.2' } });
    const blocked = await app.request('/', {
      headers: { 'x-forwarded-for': '198.51.100.2' },
    });
    expect(blocked.status).toBe(429);

    const allowed = await app.request('/', {
      headers: { 'x-forwarded-for': '198.51.100.3' },
    });
    expect(allowed.status).toBe(200);
  });
});
