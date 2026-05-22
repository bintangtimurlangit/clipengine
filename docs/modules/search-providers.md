# `search-providers`

Web search adapters used by the planner's research stage. Two
backends: Tavily and Brave. Both implement a small shared
`SearchProvider` interface so the chain can call either uniformly.

## Interface

```ts
interface SearchProvider {
  name: 'tavily' | 'brave';
  search(query: string, signal?: AbortSignal): Promise<SearchResponse>;
}

interface SearchResponse {
  provider: 'tavily' | 'brave';
  query: string;
  answer: string | null;        // Tavily-only; Brave returns null
  results: SearchResult[];
}
```

## Adapters

- `tavily.ts` — `createTavilyProvider({ apiKey, maxResults? })`.
  Uses `@tavily/core` with `searchDepth: 'basic'` and
  `includeAnswer: true`.
- `brave.ts` — `createBraveProvider({ apiKey, baseUrl?, country?,
  count?, fetchImpl? })`. Plain `fetch` to
  `https://api.search.brave.com/res/v1/web/search` with the
  `X-Subscription-Token` header.

`fetchImpl` is a test-only seam. The Brave tests stub it to inspect
the URL and headers without hitting the real service.

## Chain

`runSearchChain(settings, query, signal?, options?)`:

- Returns `null` when `settings.disabled` is true.
- Otherwise tries `[main, ...(fallback ? [fallback] : [])]` in
  order. The first response with non-empty results wins.
- Empty result sets count as a failure (the chain falls back).
- If every provider fails, returns `null` and the planner skips
  research silently. The activity log records every attempt.

## Probe

`testSearchConnection(profile)` is the live probe used by
`/api/onboarding/test/search`. Issues a `hello world` query so the
test never burns more than one credit.

## Files

- `types.ts` — `SearchProvider`, `SearchResponse`, `SearchResult`.
- `tavily.ts`, `brave.ts` — adapters.
- `chain.ts` — `runSearchChain`.
- `test-connection.ts` — `testSearchConnection`.
- `index.ts` — re-exports.

## Tests

`packages/search-providers/tests/search.test.ts` covers Brave's HTTP
shape, error propagation, chain success on the main provider,
fallback on transient failure, the disabled-marker short-circuit,
and aborted-signal handling.

Tavily isn't unit-tested directly because the SDK ships its own
client and we don't have a good seam to mock it without rewriting
the adapter. The real client is exercised at runtime.
