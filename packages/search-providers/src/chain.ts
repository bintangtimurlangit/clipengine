/**
 * Search chain: main + optional fallback.
 *
 * The planner asks the chain for a query and gets back the first
 * provider that returns a non-empty result. If both fail (or there
 * is no main configured), it returns null and the caller silently
 * skips the research stage.
 */

import type { SearchSettings } from '@clipengine/schemas';
import { createBraveProvider } from './brave.js';
import { createTavilyProvider } from './tavily.js';
import type { SearchProvider, SearchResponse } from './types.js';

export interface SearchChainOptions {
  /** Test override forwarded to Brave. */
  fetchImpl?: typeof fetch;
}

/** Build a {@link SearchProvider} from a single profile. */
function fromProfile(
  profile: { provider: 'tavily' | 'brave'; api_key: string },
  options: SearchChainOptions = {},
): SearchProvider {
  return profile.provider === 'tavily'
    ? createTavilyProvider({ apiKey: profile.api_key })
    : createBraveProvider({ apiKey: profile.api_key, fetchImpl: options.fetchImpl });
}

export interface SearchChainAttempt {
  provider: 'tavily' | 'brave';
  ok: boolean;
  latency_ms: number;
  error?: string;
}

export interface SearchChainResult {
  response: SearchResponse;
  attempts: SearchChainAttempt[];
}

/**
 * Run the search chain. Returns the first successful response with
 * any results, or `null` if both providers fail or search is
 * disabled. The planner records `attempts` in the run's activity
 * stream so the user can see what happened.
 */
export async function runSearchChain(
  settings: SearchSettings,
  query: string,
  signal?: AbortSignal,
  options: SearchChainOptions = {},
): Promise<SearchChainResult | null> {
  if (settings.disabled) return null;
  const chain: { provider: 'tavily' | 'brave'; api_key: string }[] = [settings.main];
  if (settings.fallback) chain.push(settings.fallback);

  const attempts: SearchChainAttempt[] = [];
  for (const profile of chain) {
    const start = Date.now();
    try {
      const provider = fromProfile(profile, options);
      const response = await provider.search(query, signal);
      const latency_ms = Date.now() - start;
      if (response.results.length === 0 && !response.answer) {
        attempts.push({
          provider: profile.provider,
          ok: false,
          latency_ms,
          error: 'no results',
        });
        continue;
      }
      attempts.push({ provider: profile.provider, ok: true, latency_ms });
      return { response, attempts };
    } catch (err) {
      attempts.push({
        provider: profile.provider,
        ok: false,
        latency_ms: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return null;
}
