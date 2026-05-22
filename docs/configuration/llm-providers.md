# LLM providers

ClipEngine talks to language models through the
[Vercel AI SDK](https://sdk.vercel.ai/). The settings UI exposes four
provider presets but there are only **three real adapters** under the
hood, picked by the `provider` field on the saved profile.

## The three adapters

| `provider` | Adapter | Notes |
|---|---|---|
| `openai` | [`@ai-sdk/openai`](https://www.npmjs.com/package/@ai-sdk/openai) | OpenAI's official endpoint. Optional `base_url` if you proxy through Azure or a corporate gateway. |
| `anthropic` | [`@ai-sdk/anthropic`](https://www.npmjs.com/package/@ai-sdk/anthropic) | Anthropic's Claude API. |
| `openai_compatible` | [`@ai-sdk/openai-compatible`](https://www.npmjs.com/package/@ai-sdk/openai-compatible) | Anything that speaks OpenAI's chat-completions protocol — Minimax, OpenRouter, vLLM, Ollama, custom inference servers. Requires `base_url`. |

## The four UI presets

| Preset | Maps to | Default model | Notes |
|---|---|---|---|
| OpenAI | `openai` | `gpt-4o-mini` | Best quality / cost tradeoff today. |
| Anthropic | `anthropic` | `claude-haiku-4-5` | Strong instruction following. |
| Minimax | `openai_compatible` | `abab6.5s-chat` | Defaults `base_url` to `https://api.minimax.chat/v1`. |
| Custom | `openai_compatible` | (you fill it in) | Your own endpoint. |

The reason for the split is policy: the UI shows familiar provider
names, but the engine never has more than three branches to maintain.

## Profile shape

```json
{
  "id": "5b9c5e1c-…",
  "label": "OpenAI primary",
  "provider": "openai",
  "preset": "openai",
  "api_key": "sk-…",
  "base_url": "https://api.openai.com/v1",
  "model": "gpt-4o-mini"
}
```

`base_url` is required for `openai_compatible` and optional for the
other two. `id` is a UUID — the UI generates it client-side.

## Primary + fallbacks

The full settings blob has:

```json
{
  "primary": { ...profile },
  "fallbacks": [ { ...profile }, ... ]
}
```

`runWithFallback` (in `@clipengine/llm-providers`) tries them in order
and returns the first profile that succeeds. Errors are recorded in
the run's activity log so you can tell when the primary went down.

The web UI exposes the primary in the onboarding LLM step. Editing
fallbacks happens through `PATCH /api/settings/llm` directly until a
dedicated UI lands.

## Where to set keys

- **First-time setup** — the LLM step of onboarding.
- **Anytime** — Settings → LLM. The page renders the saved JSON and
  links back to the onboarding screen for the same data with the
  Test Connection button.
- **Programmatic** — `PATCH /api/settings/llm` with the full blob.

## Cost notes

- The plan stage makes two calls per run when search is enabled
  (research-query inference + cut-plan generation) and one call when
  search is off.
- The Test Connection probe issues a four-token completion. Cost is
  a fraction of a cent per click.
- Whisper transcription cost depends on the chosen transcription
  backend, not the LLM. See
  [`transcription.md`](transcription.md).
