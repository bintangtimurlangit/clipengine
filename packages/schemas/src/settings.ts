/**
 * Settings schemas — per-user configuration that drives the pipeline.
 *
 * Settings live in a single key/value table, where the value is a
 * JSON blob validated against the schemas below. Each setting has a
 * stable key and a Zod schema; the API layer enforces both.
 */

import { z } from 'zod';

/* ------------------------------- LLM ------------------------------- */

/**
 * Real LLM adapters in the codebase: OpenAI native and Anthropic
 * native. `openai_compatible` covers Minimax, custom endpoints,
 * OpenRouter, Ollama, and anything that speaks OpenAI's chat API.
 */
export const LlmProviderSchema = z.enum(['openai', 'anthropic', 'openai_compatible']);
export type LlmProvider = z.infer<typeof LlmProviderSchema>;

/**
 * UI-facing provider preset. The settings UI shows four buttons
 * (`OpenAI`, `Anthropic`, `Minimax`, `Custom`) but they collapse onto
 * the three real adapters above.
 */
export const LlmProviderPresetSchema = z.enum(['openai', 'anthropic', 'minimax', 'custom']);
export type LlmProviderPreset = z.infer<typeof LlmProviderPresetSchema>;

const NonEmpty = z.string().trim().min(1);

export const LlmProfileSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1).max(80),
    provider: LlmProviderSchema,
    /** UI preset that originally created this profile. */
    preset: LlmProviderPresetSchema,
    api_key: NonEmpty,
    base_url: z.string().url().optional(),
    model: NonEmpty,
  })
  .refine((p) => p.provider !== 'openai_compatible' || typeof p.base_url === 'string', {
    message: 'openai_compatible profiles require base_url',
    path: ['base_url'],
  });
export type LlmProfile = z.infer<typeof LlmProfileSchema>;

/** Stored at key `llm`. */
export const LlmSettingsSchema = z.object({
  primary: LlmProfileSchema,
  /** Tried in order if the primary fails with a recoverable error. */
  fallbacks: z.array(LlmProfileSchema).default([]),
});
export type LlmSettings = z.infer<typeof LlmSettingsSchema>;

/* -------------------------- Transcription -------------------------- */

export const TranscriptionBackendSchema = z.enum([
  /** Local whisper.cpp via nodejs-whisper. */
  'local',
  /** OpenAI's `audio/transcriptions` endpoint. */
  'openai',
  /** Any OpenAI-compatible audio endpoint. */
  'openai_compatible',
]);
export type TranscriptionBackend = z.infer<typeof TranscriptionBackendSchema>;

export const WhisperModelSchema = z.enum(['tiny', 'base', 'small', 'medium', 'large-v3']);
export type WhisperModel = z.infer<typeof WhisperModelSchema>;

/** Stored at key `transcription`. */
export const TranscriptionSettingsSchema = z.discriminatedUnion('backend', [
  z.object({
    backend: z.literal('local'),
    model: WhisperModelSchema.default('base'),
    /** ISO-639-1 code; `null` lets Whisper auto-detect. */
    language: z.string().min(2).max(8).nullable().default(null),
  }),
  z.object({
    backend: z.literal('openai'),
    api_key: NonEmpty,
    /** OpenAI uses `whisper-1` for `audio/transcriptions`. */
    model: NonEmpty.default('whisper-1'),
    language: z.string().min(2).max(8).nullable().default(null),
  }),
  z.object({
    backend: z.literal('openai_compatible'),
    api_key: NonEmpty,
    base_url: z.string().url(),
    model: NonEmpty,
    language: z.string().min(2).max(8).nullable().default(null),
  }),
]);
export type TranscriptionSettings = z.infer<typeof TranscriptionSettingsSchema>;

/* ------------------------------ Search ----------------------------- */

export const SearchProviderSchema = z.enum(['tavily', 'brave']);
export type SearchProvider = z.infer<typeof SearchProviderSchema>;

export const SearchProfileSchema = z.object({
  provider: SearchProviderSchema,
  api_key: NonEmpty,
});
export type SearchProfile = z.infer<typeof SearchProfileSchema>;

/**
 * Stored at key `search`.
 *
 * `disabled: true` means the user explicitly chose to skip search
 * during onboarding and accepted the warning that the LLM loses its
 * research capability. The planner will silently skip the research
 * stage in that case.
 */
export const SearchSettingsSchema = z.union([
  z.object({
    disabled: z.literal(true),
  }),
  z.object({
    disabled: z.literal(false).default(false),
    main: SearchProfileSchema,
    fallback: SearchProfileSchema.optional(),
  }),
]);
export type SearchSettings = z.infer<typeof SearchSettingsSchema>;

/* ------------------------------ Workers ---------------------------- */

/** Stored at key `workers`. */
export const WorkerSettingsSchema = z.object({
  /** Concurrent jobs the in-process pool will run. */
  concurrency: z.number().int().min(1).max(8).default(1),
});
export type WorkerSettings = z.infer<typeof WorkerSettingsSchema>;

/* ---------------------------- Onboarding --------------------------- */

export const OnboardingStepSchema = z.enum(['transcription', 'llm', 'search', 'completed']);
export type OnboardingStep = z.infer<typeof OnboardingStepSchema>;

/** Stored at key `onboarding`. */
export const OnboardingStateSchema = z.object({
  step: OnboardingStepSchema,
  completed_at: z.string().datetime({ offset: true }).nullable().default(null),
});
export type OnboardingState = z.infer<typeof OnboardingStateSchema>;

/* ------------------------------ Index ------------------------------ */

/** Canonical setting keys; mirrors the schemas above. */
export const SETTING_KEYS = {
  llm: 'llm',
  transcription: 'transcription',
  search: 'search',
  workers: 'workers',
  onboarding: 'onboarding',
} as const;
export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/**
 * Lookup table from setting key to its Zod schema. Repos and routes
 * use this to validate writes / parse reads uniformly.
 */
export const SETTING_SCHEMAS = {
  [SETTING_KEYS.llm]: LlmSettingsSchema,
  [SETTING_KEYS.transcription]: TranscriptionSettingsSchema,
  [SETTING_KEYS.search]: SearchSettingsSchema,
  [SETTING_KEYS.workers]: WorkerSettingsSchema,
  [SETTING_KEYS.onboarding]: OnboardingStateSchema,
} as const;
