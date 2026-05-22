/**
 * Drizzle Kit configuration. Drives `db:generate`, `db:migrate`, and
 * `db:studio`. The runtime URL is read from the `DATABASE_URL` env
 * var so that the same config works for self-host (file path) and
 * tests (`:memory:`).
 *
 * The schema is listed as individual files instead of the barrel
 * `index.ts` because Drizzle Kit's bundler does not resolve the
 * `.js` extensions our ESM TypeScript source uses.
 */

import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL ?? './dev.sqlite';

export default defineConfig({
  schema: [
    './src/schema/auth.ts',
    './src/schema/settings.ts',
    './src/schema/logos.ts',
    './src/schema/presets.ts',
    './src/schema/runs.ts',
  ],
  out: './src/migrations',
  dialect: 'sqlite',
  dbCredentials: { url },
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
