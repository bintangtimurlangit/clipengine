# `search_providers` (internal)

Web search integrations for the **plan** step. Each file implements one vendor; `[registry.py](registry.py)` picks the active provider and dispatches `search(query, *, max_results=…)`.

User-facing configuration (Settings UI, Docker, full variable list) is in `**[docs/configuration.md](../../../../docs/configuration.md)`**.

## Global selection


| Variable                    | Meaning                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `SEARCH_PROVIDER_MAIN`      | Primary provider id, `auto`, or `none` / `off`.                                                                                           |
| `SEARCH_PROVIDER_FALLBACK`  | Optional second provider (not `auto`). Used if main errors or returns no text.                                                            |
| `SEARCH_PROVIDER`           | Legacy; used when `SEARCH_PROVIDER_MAIN` is unset.                                                                                        |

When **main** is unset or `auto`, the order tried is: tavily → brave → exa → firecrawl → gemini → grok → kimi → minimax → ollama_web → perplexity → searxng → duckduckgo. DuckDuckGo in `auto` only applies when it is explicitly requested as main/fallback or via `SEARCH_PROVIDER=duckduckgo`.

## Layout


| File                             | Provider id  | Required env                                                                   | Optional env                                                                                                                                     |
| -------------------------------- | ------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[_format.py](_format.py)`       | —            | —                                                                              | Shared `join_snippet_results()` for snippet-style APIs.                                                                                          |
| `[tavily.py](tavily.py)`         | `tavily`     | `TAVILY_API_KEY`                                                               | —                                                                                                                                                |
| `[brave.py](brave.py)`           | `brave`      | `BRAVE_API_KEY` or `BRAVE_SEARCH_API_KEY`                                      | `BRAVE_SEARCH_COUNTRY` / `BRAVE_COUNTRY` (optional)                                                                                              |
| `[duckduckgo.py](duckduckgo.py)` | `duckduckgo` | *(none)*                                                                       | Official Instant Answer API (`api.duckduckgo.com`); optional `pip install duckduckgo-search` for `DUCKDUCKGO_BACKEND=auto` fallback.             |
| `[exa.py](exa.py)`               | `exa`        | `EXA_API_KEY`                                                                  | —                                                                                                                                                |
| `[firecrawl.py](firecrawl.py)`   | `firecrawl`  | `FIRECRAWL_API_KEY`                                                            | —                                                                                                                                                |
| `[gemini.py](gemini.py)`         | `gemini`     | `GEMINI_API_KEY`                                                               | `GEMINI_SEARCH_MODEL` (default `gemini-2.0-flash`)                                                                                               |
| `[grok.py](grok.py)`             | `grok`       | `XAI_API_KEY`                                                                  | `XAI_SEARCH_MODEL` (default `grok-2-latest`)                                                                                                     |
| `[kimi.py](kimi.py)`             | `kimi`       | `MOONSHOT_API_KEY` or `KIMI_API_KEY`                                           | `MOONSHOT_BASE_URL` (default `https://api.moonshot.ai/v1`), `KIMI_MODEL` (default `kimi-k2.5`)                                                   |
| `[minimax.py](minimax.py)`       | `minimax`    | `MINIMAX_CODE_PLAN_KEY` or `MINIMAX_CODING_API_KEY` or `MINIMAX_API_KEY`       | `MINIMAX_REGION` (`global` / `cn`), `MINIMAX_API_HOST` (override API base)                                                                       |
| `[ollama_web.py](ollama_web.py)` | `ollama_web` | `OLLAMA_API_KEY`                                                               | `OLLAMA_WEB_SEARCH_HOST` (default `https://ollama.com`)                                                                                          |
| `[perplexity.py](perplexity.py)` | `perplexity` | `PERPLEXITY_API_KEY` **or** `OPENROUTER_API_KEY`                               | `PERPLEXITY_MODEL` (default `sonar`); if using OpenRouter: `OPENROUTER_PERPLEXITY_MODEL` (default `perplexity/sonar`), `OPENROUTER_HTTP_REFERER` |
| `[searxng.py](searxng.py)`       | `searxng`    | `SEARXNG_BASE_URL` (instance origin, no trailing slash issues handled in code) | —                                                                                                                                                |
| `[registry.py](registry.py)`     | —            | —                                                                              | `normalize_provider_id`, `resolve_provider_id`, `web_search`, `web_search_configured`, dispatch table                                            |


## Adding a provider

1. Add `yourvendor.py` with `def search(query: str, *, max_results: int = 5) -> str`.
2. Register credentials in `provider_is_configured` and append to `_AUTO_TRY_ORDER` if it should participate in `auto`.
3. Add the module to the relative import bundle in `registry.py` and an entry in `_DISPATCH`.
4. Document new env vars in `**docs/configuration.md*`*.

