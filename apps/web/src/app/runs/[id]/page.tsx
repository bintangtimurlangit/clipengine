'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { subscribeToRun } from '@/lib/sse';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface RunDetail {
  id: string;
  status: string;
  title: string;
  source: { type: string };
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
}

interface LogEntry {
  ts: string;
  level: string;
  stage: string;
  message: string;
}

interface ArtifactRow {
  id: string;
  kind: string;
  path: string;
  mime?: string;
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [run, setRun] = useState<RunDetail | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [progress, setProgress] = useState<{ stage: string; detail: string } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      const [r, l, a] = await Promise.all([
        api.get<{ run: RunDetail }>(`/api/runs/${id}`),
        api.get<{ logs: LogEntry[] }>(`/api/runs/${id}/logs`),
        api.get<{ artifacts: ArtifactRow[] }>(`/api/runs/${id}/artifacts`),
      ]);
      if (cancelled) return;
      setRun(r.run);
      setLogs(l.logs);
      setArtifacts(a.artifacts);
    }

    void loadInitial();

    const unsubscribe = subscribeToRun(id, (evt) => {
      if (evt.type === 'status') {
        const status = (evt as unknown as { status: string }).status;
        setRun((prev) => (prev ? { ...prev, status } : prev));
      } else if (evt.type === 'log') {
        const entry = (evt as unknown as { entry: LogEntry }).entry;
        setLogs((prev) => [...prev, entry]);
      } else if (evt.type === 'progress') {
        const e = evt as unknown as { stage: string; detail: string };
        setProgress({ stage: e.stage, detail: e.detail });
      } else if (evt.type === 'failed' || evt.type === 'cancelled' || evt.type === 'completed') {
        // Fetch the canonical row + artifacts again after termination.
        void api
          .get<{ run: RunDetail }>(`/api/runs/${id}`)
          .then((res) => setRun(res.run))
          .catch(() => undefined);
        void api
          .get<{ artifacts: ArtifactRow[] }>(`/api/runs/${id}/artifacts`)
          .then((res) => setArtifacts(res.artifacts))
          .catch(() => undefined);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [id]);

  // Keep the log scroll glued to the bottom while it's growing.
  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, []);

  async function onCancel() {
    await api.post(`/api/runs/${id}/cancel`);
  }

  async function onStopLive() {
    await api.post(`/api/runs/${id}/live/stop`);
  }

  if (!run) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 text-sm text-muted-foreground">
        Loading run…
      </main>
    );
  }

  const isTerminal = TERMINAL.has(run.status);
  const isLive = run.source.type === 'youtube_live' && !isTerminal;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Run</p>
          <h1 className="text-2xl font-semibold tracking-tight">{run.title}</h1>
          <p className="text-xs text-muted-foreground">
            {new Date(run.created_at).toLocaleString()} · {run.source.type}
          </p>
        </div>
        <Badge
          variant={
            isTerminal ? (run.status === 'completed' ? 'default' : 'destructive') : 'secondary'
          }
        >
          {run.status}
        </Badge>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href="/runs">Back to runs</Link>
        </Button>
        {isLive ? (
          <Button type="button" onClick={onStopLive} variant="destructive">
            Stop live capture
          </Button>
        ) : null}
        {!isTerminal ? (
          <Button type="button" onClick={onCancel} variant="destructive">
            Cancel run
          </Button>
        ) : null}
      </div>

      {run.error_message ? (
        <Alert variant="destructive">
          <AlertDescription>
            {run.error_code}: {run.error_message}
          </AlertDescription>
        </Alert>
      ) : null}

      {progress && !isTerminal ? (
        <Alert>
          <AlertDescription>
            <span className="font-medium capitalize">{progress.stage}</span>: {progress.detail}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Live log lines from the worker.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            ref={logRef}
            className="max-h-72 overflow-auto rounded-md border bg-muted p-3 font-mono text-xs"
          >
            {logs.length === 0 ? (
              <p className="text-muted-foreground">Waiting for the worker to pick up…</p>
            ) : (
              logs.map((entry, i) => (
                <div key={`${entry.ts}-${i}`}>
                  <span className="text-muted-foreground">
                    {new Date(entry.ts).toLocaleTimeString()}{' '}
                  </span>
                  <span className="text-muted-foreground">[{entry.stage}]</span>{' '}
                  <span>{entry.message}</span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outputs</CardTitle>
          <CardDescription>Files in the run&apos;s workspace. Click to download.</CardDescription>
        </CardHeader>
        <CardContent>
          {artifacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isTerminal
                ? 'This run finished without producing artifacts.'
                : 'Artifacts appear as each stage completes.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {artifacts.map((a) => (
                <li key={a.id} className="font-mono text-xs">
                  <span className="text-muted-foreground">[{a.kind}]</span> {a.path}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
