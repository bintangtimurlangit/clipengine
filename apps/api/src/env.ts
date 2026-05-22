/**
 * Environment configuration for `apps/api`.
 *
 * Validates `process.env` once at startup. Anything the API needs at
 * runtime — database path, listen address, secret keys — has to be
 * declared here.
 */

import { z } from 'zod';

const EnvSchema = z.object({
  /** Listen host. Defaults to all interfaces inside Docker. */
  HOST: z.string().min(1).default('0.0.0.0'),
  /** Listen port. */
  PORT: z.coerce.number().int().min(1).max(65_535).default(8000),
  /**
   * Directory that holds the SQLite file and any other persistent
   * state (logos, etc.). The file path is resolved relative to this.
   */
  CLIPENGINE_DATA_DIR: z.string().min(1).default('./.clipengine-data'),
  /** Workspace root for run artifacts. */
  CLIPENGINE_WORKSPACE: z.string().min(1).default('./.clipengine-workspace'),
  /**
   * Public URL the browser uses to reach the API. Used to anchor
   * cookies and CORS. Default is the local web app.
   */
  CLIPENGINE_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  /**
   * Secret used for session and cookie signing. Better Auth will
   * generate one if missing, but in production you should set it
   * yourself so cookies survive restarts.
   */
  CLIPENGINE_AUTH_SECRET: z.string().min(16).optional(),
  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  /** Set NODE_ENV explicitly so env logic is predictable. */
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Parse and cache the environment. Throws on first call if invalid. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((e) => `  - ${e.path.map(String).join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Reset the cached env. Tests only. */
export function _resetEnvForTests(): void {
  cached = null;
}
