'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, api } from '@/lib/api';

interface LogoRow {
  id: string;
  filename: string;
  mime: string;
  size: number;
  createdAt?: number | string | Date;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export default function LogosPage() {
  const [logos, setLogos] = useState<LogoRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function load() {
    try {
      const res = await api.get<{ logos: LogoRow[] }>('/api/logos');
      setLogos(res.logos);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load logos.');
      setLogos([]);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: load is closed over local setters
  useEffect(() => {
    void load();
  }, []);

  async function onUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api-engine/api/logos', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `${res.status} ${res.statusText}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this logo? Presets that reference it will lose their logo overlay.')) {
      return;
    }
    try {
      await api.delete(`/api/logos/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed.');
    }
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Logos</p>
          <h1 className="text-2xl font-semibold tracking-tight">Logo library</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard">Back</Link>
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={onUpload}
              className="hidden"
              disabled={uploading}
            />
            <span>
              <Button asChild>
                <span>{uploading ? 'Uploading…' : 'Upload logo'}</span>
              </Button>
            </span>
          </label>
        </div>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {logos === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : logos.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No logos uploaded</CardTitle>
            <CardDescription>
              PNG, JPEG, WebP, or SVG up to 5 MB. Presets reference logos by id, so they survive
              renames and re-imports.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {logos.map((logo) => (
            <li key={logo.id}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{logo.filename}</CardTitle>
                  <CardDescription>
                    {logo.mime} · {formatBytes(logo.size)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2">
                  <code className="text-xs text-muted-foreground">{logo.id}</code>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => onDelete(logo.id)}
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
