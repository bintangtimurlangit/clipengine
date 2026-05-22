/**
 * App-wide context attached to every Hono request.
 *
 * The auth middleware decorates every request with `auth` (the
 * Better Auth instance) and either `session` + `user` for signed-in
 * requests or `null` for anonymous ones. Route handlers read these
 * via `c.get('user')`.
 */

import type { DbClient } from '@clipengine/db';
import type { Auth } from './auth.js';

export interface AppBindings {
  Variables: {
    auth: Auth;
    db: DbClient;
    /** Currently signed-in user, or null for public routes. */
    user: { id: string; username: string | null } | null;
    /** Active session id, or null for public routes. */
    session: { id: string } | null;
  };
}
