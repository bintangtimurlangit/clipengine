/**
 * "Test connection" probe used by the onboarding flow.
 *
 * The user pastes a key during onboarding and the UI shows a green
 * checkmark only after this returns ok. We send a minimal query
 * ("hello world") so the test never burns more than one credit.
 */

import type { SearchProfile } from '@clipengine/schemas';
import { createBraveProvider } from './brave.js';
import { createTavilyProvider } from './tavily.js';

export interface SearchTestResult {
  ok: boolean;
  detail: string;
  latency_ms: number;
}

export async function testSearchConnection(profile: SearchProfile): Promise<SearchTestResult> {
  const start = Date.now();
  try {
    const provider =
      profile.provider === 'tavily'
        ? createTavilyProvider({ apiKey: profile.api_key })
        : createBraveProvider({ apiKey: profile.api_key });
    const res = await provider.search('hello world');
    return {
      ok: true,
      detail: `${profile.provider} reachable (${res.results.length} results)`,
      latency_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? `${profile.provider}: ${err.message}` : 'unknown error',
      latency_ms: Date.now() - start,
    };
  }
}
