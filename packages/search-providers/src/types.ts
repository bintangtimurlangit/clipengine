/**
 * Common types shared by every search adapter.
 *
 * `SearchProvider` is the interface every backend implements; the
 * planner only ever talks to this shape.
 */

export interface SearchResult {
  title: string;
  url: string;
  /** Snippet or extracted content; provider-specific. */
  content: string;
  /** Relevance score when the provider returns one. */
  score?: number;
}

export interface SearchResponse {
  /** Identifier of the provider that produced these results. */
  provider: 'tavily' | 'brave';
  query: string;
  /** Optional pre-computed answer; some providers (Tavily) include this. */
  answer: string | null;
  results: SearchResult[];
}

export interface SearchProvider {
  /** Stable identifier; used in logs and the activity stream. */
  name: 'tavily' | 'brave';
  /** Run a single web search. Adapters should respect AbortSignals. */
  search(query: string, signal?: AbortSignal): Promise<SearchResponse>;
}
