/**
 * Auth middleware. Resolves the current Better Auth session from
 * cookies and stores it on the Hono context. Subsequent handlers
 * check `c.get('user')` and `c.get('session')`.
 *
 * `requireUser` is a stricter variant that 401s anonymous requests.
 */

import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppBindings } from '../types.js';

export const sessionMiddleware: MiddlewareHandler<AppBindings> = async (c, next) => {
  const auth = c.get('auth');
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session?.user) {
    c.set('user', {
      id: session.user.id,
      username: (session.user as { username?: string | null }).username ?? null,
    });
    c.set('session', { id: session.session.id });
  } else {
    c.set('user', null);
    c.set('session', null);
  }
  await next();
};

export const requireUser: MiddlewareHandler<AppBindings> = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    throw new HTTPException(401, { message: 'authentication required' });
  }
  await next();
};
