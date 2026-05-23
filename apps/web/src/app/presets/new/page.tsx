'use client';

import { useState } from 'react';
import { PresetEditor } from '@/components/presets/preset-editor';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api';

export default function NewPresetPage() {
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  async function onImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      await api.post('/api/presets/import', json);
      window.location.href = '/presets';
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : 'Could not import preset.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <header>
        <p className="text-sm font-medium text-muted-foreground">Presets</p>
        <h1 className="text-2xl font-semibold tracking-tight">New preset</h1>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex">
          <input
            type="file"
            accept="application/json"
            onChange={onImport}
            className="hidden"
            disabled={importing}
          />
          <span>
            <Button asChild variant="outline">
              <span>{importing ? 'Importing…' : 'Import preset JSON'}</span>
            </Button>
          </span>
        </label>
      </div>
      {importError ? (
        <Alert variant="destructive">
          <AlertDescription>{importError}</AlertDescription>
        </Alert>
      ) : null}

      <PresetEditor />
    </main>
  );
}
