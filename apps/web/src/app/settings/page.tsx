'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, api } from '@/lib/api';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type Tab = 'transcription' | 'llm' | 'search' | 'workers';

interface SettingsBag {
  transcription: unknown;
  llm: unknown;
  search: unknown;
  workers: unknown;
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('transcription');
  const [bag, setBag] = useState<SettingsBag | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.get<SettingsBag>('/api/settings');
      setBag(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load settings.');
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: load is closed over local setters
  useEffect(() => {
    void load();
  }, []);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Settings</p>
          <h1 className="text-2xl font-semibold tracking-tight">App settings</h1>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back</Link>
        </Button>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <nav className="flex flex-wrap gap-2">
        {(['transcription', 'llm', 'search', 'workers'] as const).map((t) => (
          <Button
            key={t}
            variant={tab === t ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab(t)}
          >
            {t === 'workers'
              ? 'Workers'
              : t === 'llm'
                ? 'LLM'
                : t.replace(/^./, (c) => c.toUpperCase())}
          </Button>
        ))}
      </nav>

      {bag ? (
        tab === 'workers' ? (
          <WorkersForm initial={bag.workers} onSaved={load} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>
                {tab === 'llm' ? 'LLM' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </CardTitle>
              <CardDescription>
                Re-run onboarding for this section, or edit JSON in advanced mode.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <pre className="max-h-80 overflow-auto rounded-md border bg-muted p-3 font-mono text-xs">
                {JSON.stringify(bag[tab], null, 2)}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link href={`/onboarding/${tab}`}>Re-run onboarding</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      ) : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
    </main>
  );
}

interface WorkerPayload {
  concurrency: number;
}

function WorkersForm({
  initial,
  onSaved,
}: {
  initial: unknown;
  onSaved: () => Promise<void>;
}) {
  const seed = (initial as WorkerPayload | null)?.concurrency ?? 1;
  const [concurrency, setConcurrency] = useState<number>(seed);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.patch('/api/settings/workers', { concurrency });
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workers</CardTitle>
        <CardDescription>
          Maximum runs the in-process worker pool will execute concurrently. One is plenty unless
          you&apos;ve deliberately scaled up CPU and GPU for parallel renders.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSave} className="flex flex-col gap-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="concurrency">Concurrency (1–8)</Label>
            <Input
              id="concurrency"
              type="number"
              min={1}
              max={8}
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
