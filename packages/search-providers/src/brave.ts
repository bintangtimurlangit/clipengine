/**
 * Brave Search REST adapter.
 *
 * https://api.search.brave.com/res/v1/web/search — bring-your-own
 * subscription token. ClipEngine sends a single-page query with
 * default counts; the planner handles the result normalization.
 */

import type { SearchProvider, SearchResponse, SearchResult } from './types.js';

const DEFAULT_BRAVE_BASE_URL = 'https://api.search.brave.com/res/v1';

export interface BraveOptions {
  apiKey: string;
  /** Override the base URL; mostly useful for tests. */
  baseUrl?: string;
  /** ISO-3166 alpha-2 country bias, e.g. `us`. */
  country?: string;
  /** Cap result count. Brave allows 1-20; default 5. */
  count?: number;
  /** Optional fetch override for tests. */
  fetchImpl?: typeof fetch;
}

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
}

interface BraveResponse {
  web?: { results?: BraveWebResult[] };
}

export function createBraveProvider(options: BraveOptions): SearchProvider {
  const baseUrl = options.baseUrl ?? DEFAULT_BRAVE_BASE_URL;
  const fetchFn = options.fetchImpl ?? fetch;
  return {
    name: 'brave',
    async search(query, signal): Promise<SearchResponse> {
      const params = new URLSearchParams({
        q: query,
        count: String(options.count ?? 5),
      });
      if (options.country) params.set('country', options.country);
      const url = `${baseUrl}/web/search?${params.toString()}`;
      const res = await fetchFn(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': options.apiKey,
        },
        signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`brave: ${res.status} ${res.statusText}${body ? `: ${body}` : ''}`);
      }
      const json = (await res.json()) as BraveResponse;
      const results: SearchResult[] = (json.web?.results ?? []).map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        content: r.description ?? '',
      }));
      return {
        provider: 'brave',
        query,
        answer: null,
        results,
      };
    },
  };
}
