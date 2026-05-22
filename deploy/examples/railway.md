# Deploying ClipEngine on Railway

[Railway](https://railway.app/) supports Docker Compose deploys via a
config file. ClipEngine fits Railway's per-service model: one service
for the API, one for the web UI, and a persistent volume each for
`/data` and `/workspace`.

## Quick start

1. Click **New Project → Deploy from GitHub repo** and select your
   ClipEngine fork.
2. Railway detects the compose file under `deploy/compose.yaml`.
3. Set environment variables in the project's **Variables** tab:

   | Variable | Value |
   |---|---|
   | `CLIPENGINE_PUBLIC_URL` | the public URL Railway gives you |
   | `CLIPENGINE_AUTH_SECRET` | `openssl rand -hex 32` output |
   | `CORS_ORIGINS` | same as `CLIPENGINE_PUBLIC_URL` |

4. Attach a volume to each service:
   - `api` → mount path `/data` (SQLite + logos)
   - `api` → mount path `/workspace` (run artifacts)

5. Deploy. The web service handles HTTP; the API stays internal.

## Notes

- Railway's free tier doesn't include enough RAM for the local Whisper
  backend with the `base` model on every run. Either pick a paid plan
  or use `OpenAI Whisper API` / a custom OpenAI-compatible endpoint
  during onboarding.
- For multi-region availability, replicate the volumes to a Railway
  Postgres instance later (the schema is Postgres-compatible). v1
  ships SQLite only.
