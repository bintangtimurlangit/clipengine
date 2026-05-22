# `@clipengine/web`

Next.js 16 (App Router) UI for ClipEngine. Talks to `@clipengine/api`
via REST and SSE.

## Entry flow

1. **First boot** — `/` redirects to `/register`. The user creates the
   single admin account with **username + password + password
   confirmation** (no email). Once created, registration is closed.
2. **Onboarding** — after the admin is created, the user is forced
   through the two-step setup (transcription, LLM) before they can
   reach the dashboard.
3. **Subsequent visits** — `/` redirects to `/login` if signed out.

There is no marketing or landing page in this repo. The app is meant
to be self-hosted; the front door is the registration screen.

## Pages

- `(auth)/register` — first-run admin creation. Closed after.
- `(auth)/login` — username + password.
- `onboarding/transcription` and `onboarding/llm` — gated, must
  complete in order.
- `(app)/` — authed shell:
  - `/` dashboard / new run
  - `/runs`, `/runs/[id]`
  - `/presets`, `/presets/[id]/edit`
  - `/logos`
  - `/settings/*`


