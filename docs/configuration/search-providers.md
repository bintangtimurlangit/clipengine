# Search providers

The plan stage can ground the LLM's picks in actual web context.
ClipEngine ships two search adapters: Tavily and Brave. Wire one as
**main** and (optionally) one as **fallback**, or skip search
entirely.

## What "research" does

Before the cut-plan call, the planner asks the LLM to produce two
short queries:

1. **Identity** — what video / show / creator is this?
2. **Highlights** — what moments do fans care about?

Each query goes through the search chain. The first response with
results becomes part of the cut-plan prompt as a compact context
block. The LLM then has external knowledge to ground titles,
rationales, and clip selection.

## Tavily

- API: [`@tavily/core`](https://www.npmjs.com/package/@tavily/core).
- Defaults to `searchDepth: 'basic'`, `maxResults: 5`,
  `includeAnswer: true`.
- Cost: see [Tavily's pricing](https://tavily.com/#pricing). Each
  ClipEngine run does at most two searches.

Profile:

```json
{ "provider": "tavily", "api_key": "tvly-…" }
```

## Brave

- API: REST against
  `https://api.search.brave.com/res/v1/web/search`.
- ClipEngine sends the `X-Subscription-Token` header. Optionally
  pass `country` (ISO-3166 alpha-2) to bias results.
- Cost: see [Brave's pricing](https://brave.com/search/api/).

Profile:

```json
{ "provider": "brave", "api_key": "BSA…" }
```

## Chain behavior

```json
{
  "disabled": false,
  "main": { "provider": "tavily", "api_key": "tvly-…" },
  "fallback": { "provider": "brave", "api_key": "BSA…" }
}
```

The chain runs main first. If main throws, returns no results, or
returns no answer, the fallback gets a chance. If the fallback also
fails, the chain returns null and the planner skips research silently
(an entry in the activity log records the attempts).

## Skipping search

```json
{ "disabled": true }
```

Saves the marker; the planner short-circuits before making a request.
The web UI's onboarding step shows a destructive warning before
allowing this — without search, the LLM works from transcript only,
and cuts tend to be less informed.

## Test Connection

Both providers have a probe endpoint at
`POST /api/onboarding/test/search`. The probe issues a `hello world`
query and reports `ok` + result count + latency.

## Switching providers

`PATCH /api/settings/search` with a new blob. The next run uses the
new setting; in-flight runs are unaffected.
