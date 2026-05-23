'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, api } from '@/lib/api';

interface PresetRow {
  id: string;
  name: string;
  kind: 'longform' | 'shortform';
  orientation: 'horizontal' | 'vertical';
  dimensions: { width: number; height: number };
}

export default function PresetsListPage() {
  const [presets, setPresets] = useState<PresetRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.get<{ presets: PresetRow[] }>('/api/presets');
      setPresets(res.presets);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load presets.');
      setPresets([]);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: load is closed over local setters
  useEffect(() => {
    void load();
  }, []);

  async function onDelete(id: string) {
    if (!confirm('Delete this preset?')) return;
    try {
      await api.delete(`/api/presets/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed.');
    }
  }

  async function onExport(id: string, name: string) {
    const res = await fetch(`/api-engine/api/presets/${id}/export`, {
      credentials: 'include',
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.preset.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Presets</p>
          <h1 className="text-2xl font-semibold tracking-tight">Render presets</h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard">Back</Link>
          </Button>
          <Button asChild>
            <Link href="/presets/new">New preset</Link>
          </Button>
        </div>
      </header>

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {presets === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : presets.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No presets yet</CardTitle>
            <CardDescription>
              Defaults seed automatically on first run. Create one to customize dimensions, logo, or
              subtitles.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/presets/new">Create preset</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {presets.map((preset) => (
            <li key={preset.id}>
              <Card>
                <CardHeader className="flex-row items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{preset.name}</CardTitle>
                    <CardDescription>
                      {preset.dimensions.width}×{preset.dimensions.height} · {preset.orientation}
                    </CardDescription>
                  </div>
                  <Badge variant={preset.kind === 'longform' ? 'default' : 'secondary'}>
                    {preset.kind}
                  </Badge>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/presets/${preset.id}/edit`}>Edit</Link>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onExport(preset.id, preset.name)}
                  >
                    Export JSON
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => onDelete(preset.id)}
                  >
                    Delete
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
