/**
 * API request/response shapes for `apps/api`. These are the bodies
 * the HTTP layer validates with `@hono/zod-openapi`. Domain shapes
 * (Run, Preset, etc.) live in their own modules.
 */

import { z } from 'zod';

/* -------------------------- Auth / users --------------------------- */

const Username = z
  .string()
  .trim()
  .min(3, 'username must be at least 3 characters')
  .max(32, 'username must be at most 32 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'username may only contain letters, digits, underscore, and hyphen');

const Password = z.string().min(8, 'password must be at least 8 characters').max(256);

/** First-run admin registration. Username + password + confirmation. */
export const RegisterInputSchema = z
  .object({
    username: Username,
    password: Password,
    password_confirmation: Password,
  })
  .refine((v) => v.password === v.password_confirmation, {
    message: 'passwords do not match',
    path: ['password_confirmation'],
  });
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  username: Username,
  password: Password,
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

/* ---------------------- Onboarding test calls ---------------------- */

import { LlmProfileSchema, SearchProfileSchema, TranscriptionSettingsSchema } from './settings.js';

export const TestTranscriptionInputSchema = TranscriptionSettingsSchema;
export const TestLlmInputSchema = LlmProfileSchema;
export const TestSearchInputSchema = SearchProfileSchema;

export const ConnectionTestResultSchema = z.object({
  ok: z.boolean(),
  /** Short human-readable label, e.g. `OpenAI gpt-4o-mini reachable`. */
  detail: z.string(),
  /** Optional latency in milliseconds. */
  latency_ms: z.number().int().nonnegative().optional(),
});
export type ConnectionTestResult = z.infer<typeof ConnectionTestResultSchema>;

/* ------------------------------ Errors ----------------------------- */

/** Uniform error body for the API. Codes are stable; messages may change. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    /** Optional field path for validation errors. */
    path: z.array(z.union([z.string(), z.number()])).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
