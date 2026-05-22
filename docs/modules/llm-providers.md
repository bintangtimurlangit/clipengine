# `llm-providers`

Thin wrapper around the [Vercel AI SDK](https://sdk.vercel.ai/). Three
exported helpers and three real adapters under one factory. The four
UI presets (OpenAI, Anthropic, Minimax, Custom) collapse onto these
three adapters via the `provider` field.

## `getLanguageModel(profile)`

Builds an AI SDK `LanguageModel` from a saved `LlmProfile`:

- `provider: 'openai'` → `@ai-sdk/openai` with optional `base_url`
  override.
- `provider: 'anthropic'` → `@ai-sdk/anthropic` with optional
  `base_url` override.
- `provider: 'openai_compatible'` → `@ai-sdk/openai-compatible`. The
  factory labels the provider `minimax` or `custom` based on the
  preset, which makes errors easier to read.

Same factory backs both the planner and the onboarding "Test
connection" button, so behavior is identical at config and run time.

## `runWithFallback(settings, call)`

Tries each profile in `[primary, ...fallbacks]` until one succeeds.
Returns the result, the profile that produced it, and a per-profile
attempt log:

```ts
{
  result: <T>,
  used: LlmProfile,
  attempts: [{ profile, ok, latency_ms, error? }, ...]
}
```

The planner records `attempts` in the run's activity stream so the
operator can see when the primary went down.

## `testLlmConnection(profile)`

The probe used by `/api/onboarding/test/llm`. Issues a one-token
`generateText` call so the test costs negligible credits. Returns
`{ ok, detail, latency_ms }`.

## Files

- `factory.ts` — `getLanguageModel`.
- `chain.ts` — `runWithFallback`, `ChainResult`, `ChainAttempt`.
- `test-connection.ts` — `testLlmConnection`.
- `index.ts` — re-exports.

## Why three adapters

OpenAI and Anthropic each have native AI SDK packages with provider-
specific quirks (system prompt placement, tool use schema, etc.).
The `openai-compatible` shim handles every other endpoint that
implements OpenAI's chat-completions protocol. Three real branches
covers the entire market without us building a custom adapter.

## Adding a provider

If a future provider isn't OpenAI- or Anthropic-shaped, add a fourth
adapter in `factory.ts` with its own AI SDK package. Update
`LlmProvider` in `@clipengine/schemas/settings.ts` to add the new
variant. The chain and test helpers don't need to change.
