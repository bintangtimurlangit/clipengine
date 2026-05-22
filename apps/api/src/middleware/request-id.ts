/**
 * Stable request id middleware.
 *
 * Adds an `x-request-id` header to every response, generated when
 * the client doesn't send one. Useful for log correlation and the
 * uniform error envelope.
 */

import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import type { AppBindings } from '../types.js';

export const requestIdMiddleware: MiddlewareHandler<AppBindings> = async (c, next) => {
  const inbound = c.req.header('x-request-id');
  const id = inbound && inbound.length <= 128 ? inbound : randomUUID();
  c.header('x-request-id', id);
  await next();
};
