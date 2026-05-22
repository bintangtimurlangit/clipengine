# Onboarding

ClipEngine forces a three-step setup before the dashboard. The
sequence runs the first time the admin signs in and any time a
required setting is reset.

## 1. Account

The first visit lands on `/register`:

- **Username** — 3–32 characters, letters / digits / underscore /
  hyphen.
- **Password** — at least 8 characters.
- **Confirm password** — must match.

The web form posts to Better Auth's `/sign-up/email` endpoint with the
[username plugin](https://www.better-auth.com/docs/plugins/username),
then signs in immediately so the cookie is set. ClipEngine never asks
for an email; we synthesize `<username>@clipengine.local` to satisfy
Better Auth's required column.

After this, `/register` is closed for good. Subsequent visitors see
`/login` instead.

## 2. Transcription

`/onboarding/transcription` picks how audio becomes text:

- **Local Whisper** — free, runs on this server. Uses
  [whisper.cpp](https://github.com/ggerganov/whisper.cpp) via
  `nodejs-whisper`. Pick a model: `tiny` (~75 MB), `base` (~150 MB,
  recommended), `small`, `medium`, or `large-v3` (~3 GB).
- **OpenAI Whisper API** — paste your key. Defaults to `whisper-1`
  but you can override the model.
- **Custom OpenAI-compatible endpoint** — base URL, model, key.
  Works with any service that implements
  `POST /audio/transcriptions` (OpenAI's API shape).

A **Test connection** button hits the server's onboarding probe
(`POST /api/onboarding/test/transcription`). For local it returns
`ok` immediately because there's no remote endpoint to ping; for the
remote backends it does a `GET /models` round trip and shows the
status code + latency.

Save and continue advances to the next step. The setting is stored in
`settings.transcription`.

## 3. LLM

`/onboarding/llm` configures the language model that picks cuts:

- **OpenAI** — defaults to `gpt-4o-mini`.
- **Anthropic** — defaults to `claude-haiku-4-5`.
- **Minimax** — uses Minimax's OpenAI-compatible endpoint
  (`https://api.minimax.chat/v1`) under the hood.
- **Custom (OpenAI-compatible)** — base URL + model.

The four UI presets collapse onto two real adapters
(`@ai-sdk/openai` and `@ai-sdk/anthropic`) plus the universal
`@ai-sdk/openai-compatible` shim — see
[configuration/llm-providers.md](../configuration/llm-providers.md).

**Test connection** issues a one-token `generateText` call so the
test costs negligible credits.

## 4. Web search

`/onboarding/search` is required, but you can opt out with an explicit
warning:

- **Tavily** — paste your `tvly-...` key.
- **Brave** — paste your subscription token.
- **Both** — pick one as main, paste the other for fallback.

The chain runs main first, falls back on transient errors. ClipEngine
doesn't share keys with any other service.

**Skip with warning** surfaces a destructive alert that the LLM loses
its research capability — cuts work from the transcript only and tend
to be less informed about creators or community context. Confirming
saves `{ disabled: true }` and finishes onboarding.

## State

The onboarding state lives in `settings.onboarding`:

```json
{
  "step": "completed",
  "completed_at": "2026-05-22T18:00:00Z"
}
```

While `step` is anything other than `completed`, the web app's `/`
redirects back into the matching onboarding page. Re-running an
individual step from `/settings` re-saves that section without
re-walking the whole flow.
