/**
 * Tiny Zod-based body validator for Hono routes.
 *
 * The full @hono/zod-openapi stack is overkill while routes are
 * still moving fast; for now we just parse the JSON body, validate,
 * and stash the result on the context.
 */

import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { z } from 'zod';
import type { AppBindings } from '../types.js';

declare module 'hono' {
  interface ContextVariableMap {
    /** Set by {@link validateJson}. Cast to your route's type at use site. */
    parsedBody: unknown;
  }
}

export function validateJson<T>(schema: z.ZodSchema<T>) {
  return async (c: Context<AppBindings>, next: Next) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new HTTPException(400, { message: 'invalid JSON body' });
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues
          .map((issue) => `${issue.path.map(String).join('.') || '<root>'}: ${issue.message}`)
          .join('; '),
      });
    }
    c.set('parsedBody', parsed.data);
    await next();
  };
}
