/**
 * Primary + fallback LLM chain.
 *
 * The user picks one primary profile and (optionally) an ordered
 * list of fallbacks. {@link runWithFallback} tries each profile in
 * turn and returns the first successful result. Recoverable errors
 * are reported through the {@link ChainAttempt} log so the planner
 * can write them to the run's activity stream.
 */

import type { LlmProfile, LlmSettings } from '@clipengine/schemas';
import type { LanguageModel } from 'ai';
import { getLanguageModel } from './factory.js';

export interface ChainAttempt {
  profile: LlmProfile;
  ok: boolean;
  /** Latency in milliseconds for the call. */
  latency_ms: number;
  /** Error message when `ok` is false. */
  error?: string;
}

export interface ChainResult<T> {
  result: T;
  /** The profile that produced `result`. */
  used: LlmProfile;
  /** Every profile that was tried, in order. */
  attempts: ChainAttempt[];
}

/**
 * Run `call` with each profile in `[primary, ...fallbacks]` until one
 * succeeds. The chain stops on the first success or rethrows the
 * last error if every profile fails.
 */
export async function runWithFallback<T>(
  settings: LlmSettings,
  call: (model: LanguageModel, profile: LlmProfile) => Promise<T>,
): Promise<ChainResult<T>> {
  const profiles: LlmProfile[] = [settings.primary, ...settings.fallbacks];
  const attempts: ChainAttempt[] = [];
  let lastErr: unknown;

  for (const profile of profiles) {
    const start = Date.now();
    try {
      const model = getLanguageModel(profile);
      const result = await call(model, profile);
      attempts.push({ profile, ok: true, latency_ms: Date.now() - start });
      return { result, used: profile, attempts };
    } catch (err) {
      lastErr = err;
      attempts.push({
        profile,
        ok: false,
        latency_ms: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('llm chain: every profile failed');
}
