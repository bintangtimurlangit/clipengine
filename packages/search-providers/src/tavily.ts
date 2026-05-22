/**
 * Tavily web search adapter.
 *
 * Tavily ships an LLM-tailored search API. We use it for the
 * planner's "what is this video about?" research stage. Returns the
 * raw normalized {@link SearchResult} list; the planner is
 * responsible for deciding what to do with it.
 */

import { tavily } from '@tavily/core';
import type { SearchProvider, SearchResult } from './types.js';

export interface TavilyOptions {
  apiKey: string;
  /** Cap result count. Tavily allows 1-20; default 5. */
  maxResults?: number;
}

/** Build a Tavily-backed {@link SearchProvider}. */
export function createTavilyProvider(options: TavilyOptions): SearchProvider {
  const client = tavily({ apiKey: options.apiKey });
  return {
    name: 'tavily',
    async search(query, signal) {
      signal?.throwIfAborted();
      const response = await client.search(query, {
        searchDepth: 'basic',
        maxResults: options.maxResults ?? 5,
        includeAnswer: true,
      });
      const results: SearchResult[] = (response.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content ?? '',
        score: typeof r.score === 'number' ? r.score : undefined,
      }));
      return {
        provider: 'tavily',
        query,
        answer: response.answer ?? null,
        results,
      };
    },
  };
}
