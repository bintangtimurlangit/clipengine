/**
 * Subscribe to a per-run SSE feed under `/api-engine/api/runs/:id/stream`.
 *
 * Returns an unsubscribe function. Each event is delivered as a parsed
 * JSON payload because the API encodes RunEvent as JSON in the `data:`
 * field.
 */

export type RunEventType = 'status' | 'log' | 'progress' | 'failed' | 'completed' | 'cancelled';

export interface RunEventPayload {
  type: RunEventType;
  runId: string;
  // The shape varies per event type; consumers parse what they need.
  [key: string]: unknown;
}

export function subscribeToRun(
  runId: string,
  onEvent: (event: RunEventPayload) => void,
  onError?: (err: Event) => void,
): () => void {
  const source = new EventSource(`/api-engine/api/runs/${runId}/stream`, {
    withCredentials: true,
  });
  const handler = (msg: MessageEvent<string>) => {
    try {
      onEvent(JSON.parse(msg.data) as RunEventPayload);
    } catch {
      // Malformed payload; ignore.
    }
  };
  for (const type of ['status', 'log', 'progress', 'failed', 'completed', 'cancelled'] as const) {
    source.addEventListener(type, handler as EventListener);
  }
  source.onerror = (err) => {
    onError?.(err);
  };
  return () => {
    source.close();
  };
}
