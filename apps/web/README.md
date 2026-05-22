# `@clipengine/web`

Next.js 16 (App Router) UI for ClipEngine. Talks to `@clipengine/api`
via REST and SSE.

## Entry flow

1. **First boot** — `/` redirects to `/register`. The user creates the
   single admin account with **username + password + password
   confirmation** (no email). Once created, registration is closed.
2. **Onboarding** — after the admin is created, the user is forced
   through the three-step setup before they can reach the dashboard:
   1. Transcription (local Whisper, OpenAI, or custom OpenAI-compat).
   2. LLM (OpenAI, Anthropic, Minimax, or custom OpenAI-compat).
   3. Web search (Tavily or Brave or both). Skipping this step
      requires confirming a warning that the LLM will lose the ability
      to research context outside the transcript.
3. **Subsequent visits** — `/` redirects to `/login` if signed out.

There is no marketing or landing page in this repo. The app is meant
to be self-hosted; the front door is the registration screen.

## Pages

- `(auth)/register` — first-run admin creation. Closed after.
- `(auth)/login` — username + password.
- `onboarding/transcription`, `onboarding/llm`, `onboarding/search` —
  gated, must complete in order. Search may be skipped with an
  explicit warning.
- `(app)/` — authed shell:
  - `/` dashboard / new run
  - `/runs`, `/runs/[id]`
  - `/presets`, `/presets/[id]/edit`
  - `/logos`
  - `/settings/*`


