# API: Settings

Per-user JSON settings. Reads return every key the user has saved;
writes validate the body against the matching Zod schema before
upsert.

## Keys

| Key | Schema | Notes |
|---|---|---|
| `transcription` | `TranscriptionSettingsSchema` | local / openai / openai_compatible |
| `llm` | `LlmSettingsSchema` | primary + fallbacks |
| `search` | `SearchSettingsSchema` | tavily, brave, or `{ disabled: true }` |
| `workers` | `WorkerSettingsSchema` | `{ concurrency: 1..8 }` |
| `onboarding` | `OnboardingStateSchema` | step + completed_at |

The full canonical list lives in
[`packages/schemas/src/settings.ts`](../../packages/schemas/src/settings.ts).

## `GET /api/settings`

```json
{
  "transcription": { "backend": "local", "model": "base", "language": null },
  "llm": { "primary": { ... }, "fallbacks": [] },
  "search": { "disabled": true },
  "workers": { "concurrency": 1 },
  "onboarding": { "step": "completed", "completed_at": "..." }
}
```

Missing keys come back as `null`.

## `PATCH /api/settings/:key`

Body is the parsed value the schema expects. Server validates with
Zod; on failure returns `400` with a joined issue list:

```json
{ "error": { "code": "http_error", "message": "primary.base_url: Invalid url" } }
```

On success returns `{ "key": "<key>", "value": <parsed value> }`.

## Setting individual keys

Common admin tweaks:

```bash
# Change concurrency
curl -X PATCH /api-engine/api/settings/workers \
    -H 'content-type: application/json' \
    -b cookies.txt \
    -d '{"concurrency": 3}'

# Disable search after the fact
curl -X PATCH /api-engine/api/settings/search \
    -H 'content-type: application/json' \
    -b cookies.txt \
    -d '{"disabled": true}'

# Switch transcription backend
curl -X PATCH /api-engine/api/settings/transcription \
    -H 'content-type: application/json' \
    -b cookies.txt \
    -d '{"backend":"openai","api_key":"sk-...","model":"whisper-1","language":null}'
```

In-flight runs keep the snapshot of settings they captured at start.
The new value applies to runs that haven't been claimed yet.
