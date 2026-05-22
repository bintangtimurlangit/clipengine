/**
 * Better Auth instance for ClipEngine.
 *
 * - Email + password sign-in is the only credential. The
 *   {@link username} plugin lets the user log in with their
 *   handle instead of an email; ClipEngine never asks for or
 *   shows an email.
 * - The Drizzle adapter is wired against `@clipengine/db`'s schema.
 * - One admin allowed during the first-run flow. Subsequent
 *   self-signups are blocked at the route layer (see
 *   `routes/onboarding.ts`).
 */

import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { type DbClient, schema } from '@clipengine/db';
import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins';
import type { Env } from './env.js';

export interface BuildAuthOptions {
  db: DbClient;
  env: Pick<Env, 'CLIPENGINE_PUBLIC_URL' | 'CLIPENGINE_AUTH_SECRET' | 'NODE_ENV' | 'CORS_ORIGINS'>;
}

export type Auth = ReturnType<typeof buildAuth>;

/**
 * Build the Better Auth instance. The returned object exposes
 * `handler`, `api`, and `options`. Call `auth.handler(request)` from
 * Hono to delegate `/api/auth/*` routes.
 */
export function buildAuth({ db, env }: BuildAuthOptions) {
  const trustedOrigins = env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (!trustedOrigins.includes(env.CLIPENGINE_PUBLIC_URL)) {
    trustedOrigins.push(env.CLIPENGINE_PUBLIC_URL);
  }

  return betterAuth({
    appName: 'ClipEngine',
    baseURL: env.CLIPENGINE_PUBLIC_URL,
    secret: env.CLIPENGINE_AUTH_SECRET,
    trustedOrigins,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      autoSignIn: true,
    },
    advanced: {
      cookiePrefix: 'clipengine',
      useSecureCookies: env.NODE_ENV === 'production',
    },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 32,
        usernameValidator: (value) => /^[a-zA-Z0-9_-]+$/.test(value),
      }),
    ],
  });
}
