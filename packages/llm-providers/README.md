# `@clipengine/llm-providers`

Thin wrapper around the [Vercel AI SDK](https://sdk.vercel.ai/) for
ClipEngine's planning stage. Exposes a single `getModel()` factory plus
a primary/fallback chain helper.

## Supported providers

- **OpenAI** (`@ai-sdk/openai`)
- **Anthropic** (`@ai-sdk/anthropic`)
- **OpenAI-compatible** (`@ai-sdk/openai-compatible`) — covers Minimax,
  custom endpoints, OpenRouter, Ollama, vLLM, etc.


