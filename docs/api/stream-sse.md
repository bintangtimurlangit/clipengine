# API: SSE stream

`GET /api/runs/:id/stream` returns a Server-Sent Events feed.

## Event types

Every event has a typed `event:` line plus a JSON `data:` payload.

| `event` | `data` shape |
|---|---|
| `status` | `{ "type": "status", "runId": "...", "status": "transcribing" }` |
| `log` | `{ "type": "log", "runId": "...", "entry": { "ts": "ISO", "level": "info", "stage": "ingest", "message": "..." } }` |
| `progress` | `{ "type": "progress", "runId": "...", "stage": "render", "detail": "longform 1/3: ...", "percent": 33 }` |
| `failed` | `{ "type": "failed", "runId": "...", "errorCode": "render_failed", "errorMessage": "..." }` |
| `completed` | `{ "type": "completed", "runId": "..." }` |
| `cancelled` | `{ "type": "cancelled", "runId": "..." }` |

A bootstrapping `status` event fires immediately on connection so
reconnects always render a current state. After any of `failed`,
`completed`, or `cancelled`, the server closes the stream.

## Browser usage

The web app uses native `EventSource`:

```ts
const source = new EventSource(`/api-engine/api/runs/${id}/stream`, {
  withCredentials: true,
});

source.addEventListener('log', (msg) => {
  const evt = JSON.parse(msg.data);
  // ...append to log pane
});

source.addEventListener('completed', () => source.close());
```

See [`apps/web/src/lib/sse.ts`](../../apps/web/src/lib/sse.ts) for the
helper the run detail page uses.

## Reverse proxy notes

SSE needs the proxy to keep the connection open and not buffer
responses. See
[`self-host/reverse-proxy.md`](../self-host/reverse-proxy.md). nginx
needs `proxy_buffering off`; Caddy and Cloudflare are correct by
default.

## Reconnect strategy

`EventSource` retries on its own with exponential backoff. The web
app also polls `GET /api/runs/:id` every few seconds as a safety net
so the UI converges even if SSE silently dies behind a strict proxy.
