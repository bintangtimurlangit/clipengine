/**
 * Live "Test connection" probe used by the onboarding flow.
 *
 * The route handler calls this with a candidate {@link LlmProfile}
 * and gets back a structured pass/fail. We send the smallest
 * possible request — a single token — so the test never costs
 * more than a fraction of a cent and finishes quickly.
 */

import type { LlmProfile } from '@clipengine/schemas';
import { generateText } from 'ai';
import { getLanguageModel } from './factory.js';

export interface LlmTestResult {
  ok: boolean;
  /** Short human-readable label, e.g. `OpenAI gpt-4o-mini reachable`. */
  detail: string;
  /** Round-trip in milliseconds for the request. */
  latency_ms: number;
}

/** Verify that the configured model can produce at least one token. */
export async function testLlmConnection(profile: LlmProfile): Promise<LlmTestResult> {
  const start = Date.now();
  try {
    const model = getLanguageModel(profile);
    await generateText({
      model,
      prompt: 'Reply with the single word OK.',
      // Keep cost negligible.
      maxOutputTokens: 4,
      temperature: 0,
    });
    return {
      ok: true,
      detail: `${profile.provider}/${profile.model} reachable`,
      latency_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      detail:
        err instanceof Error
          ? `${profile.provider}/${profile.model}: ${err.message}`
          : 'unknown error',
      latency_ms: Date.now() - start,
    };
  }
}
