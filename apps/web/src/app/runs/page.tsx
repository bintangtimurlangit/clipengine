'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface RunRow {
  id: string;
  status: string;
  title: string;
  source: { type: string };
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  acquiring: 'Downloading',
  transcribing: 'Transcribing',
  researching: 'Researching',
  planning: 'Planning',
  rendering: 'Rendering',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'default';
    case 'failed':
      return 'destructive';
    case 'cancelled':
      return 'outline';
    default:
      return 'secondary';
  }
}

export default function RunsListPage() {
  const [runs, setRuns] = useState<RunRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api.get<{ runs: RunRow[] }>('/api/runs');
        if (!cancelled) setRuns(res.runs);
      } catch {
        if (!cancelled) setRuns([]);
      }
    }
    void load();
    const id = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Runs</p>
          <h1 className="text-2xl font-semibold tracking-tight">Your clip runs</h1>
        </div>
        <Button asChild>
          <Link href="/dashboard">New run</Link>
        </Button>
      </header>

      {runs === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : runs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No runs yet</CardTitle>
            <CardDescription>Start one from the dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard">New run</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                href={`/runs/${run.id}`}
                className="block rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium leading-tight">{run.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(run.created_at).toLocaleString()} · {run.source.type}
                    </p>
                  </div>
                  <Badge variant={statusVariant(run.status)}>
                    {STATUS_LABEL[run.status] ?? run.status}
                  </Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
