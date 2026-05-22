# `@clipengine/search-providers`

Web search adapters used during the planning stage to give the LLM
context about the source video.

## Supported providers

- **Tavily** (`@tavily/core`) — API-backed, optimized for LLM context.
- **Brave** — REST API, paid tier.

## Behavior

Settings choose a `main` provider and an optional `fallback`. Both off
means the research step is skipped.


