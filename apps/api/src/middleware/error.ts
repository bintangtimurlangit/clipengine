/**
 * Standardize error responses across the API.
 *
 * Mounted via `app.onError`. Routes throw `HTTPException` for
 * expected failures and any other `Error` for bugs. The handler
 * wraps both in the {@link ApiErrorSchema} envelope so the web
 * client can rely on a stable shape.
 */

import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppBindings } from '../types.js';

export const errorHandler: ErrorHandler<AppBindings> = (err, c) => {
  if (err instanceof HTTPException) {
    return c.json(
      {
        error: {
          code: 'http_error',
          message: err.message || 'request failed',
        },
      },
      err.status,
    );
  }

  console.error('[api] unhandled error', err);
  return c.json(
    {
      error: {
        code: 'internal',
        message: 'internal server error',
      },
    },
    500,
  );
};
