/**
 * Build the ClipEngine API as a Hono app.
 *
 * - `/health` is a public liveness probe.
 * - `/api/auth/*` is delegated to Better Auth.
 * - `/api/registration-status` reports whether the single-admin slot
 *   is open. The web app uses this to decide between rendering
 *   `/register` and `/login` on first visit.
 *
 * The factory takes pre-built dependencies (db, auth, env) so tests
 * can swap them out.
 */

import { type DbClient, UsersRepo } from '@clipengine/db';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Auth } from './auth.js';
import type { Env } from './env.js';
import { sessionMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error.js';
import type { AppBindings } from './types.js';

export interface BuildAppOptions {
  db: DbClient;
  auth: Auth;
  env: Env;
}

export function buildApp({ db, auth, env }: BuildAppOptions) {
  const app = new Hono<AppBindings>();

  app.onError(errorHandler);
  app.use('*', logger());
  app.use(
    '*',
    cors({
      origin: env.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean),
      credentials: true,
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  // Decorate every request with shared services + auth context.
  app.use('*', async (c, next) => {
    c.set('auth', auth);
    c.set('db', db);
    await next();
  });
  app.use('*', sessionMiddleware);

  // Liveness probe.
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Better Auth: handles /sign-up/email, /sign-in/username, sessions, etc.
  app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

  // Single-admin gate: tells the web app whether to show register or login.
  app.get('/api/registration-status', async (c) => {
    const repo = new UsersRepo(db);
    const count = await repo.count();
    return c.json({ open: count === 0, admin_count: count });
  });

  return app;
}
