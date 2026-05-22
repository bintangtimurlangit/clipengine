'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, api } from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type SourceType = 'youtube_vod' | 'youtube_live' | 'upload';

interface PresetRow {
  id: string;
  name: string;
  kind: 'longform' | 'shortform';
}

interface CreatedRun {
  run: { id: string };
}

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB

async function uploadFile(file: File): Promise<string> {
  const init = await api.post<{ upload_id: string }>('/api/sources/uploads', {
    filename: file.name,
    mime: file.type || 'application/octet-stream',
    total_size: file.size,
  });
  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    const slice = file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size));
    const buffer = await slice.arrayBuffer();
    const res = await fetch(`/api-engine/api/sources/uploads/${init.upload_id}/chunks`, {
      method: 'POST',
      body: buffer,
      credentials: 'include',
    });
    if (!res.ok) {
      throw new Error(`upload chunk failed: ${res.status}`);
    }
  }
  return init.upload_id;
}

export default function NewRunPage() {
  const router = useRouter();
  const [presets, setPresets] = useState<PresetRow[]>([]);
  const [presetsLoaded, setPresetsLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [longformId, setLongformId] = useState<string>('');
  const [shortformId, setShortformId] = useState<string>('');
  const [sourceType, setSourceType] = useState<SourceType>('youtube_vod');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api
      .get<{ presets: PresetRow[] }>('/api/presets')
      .then((res) => {
        setPresets(res.presets);
        const longform = res.presets.find((p) => p.kind === 'longform');
        const shortform = res.presets.find((p) => p.kind === 'shortform');
        setLongformId(longform?.id ?? '');
        setShortformId(shortform?.id ?? '');
        setPresetsLoaded(true);
      })
      .catch(() => setPresetsLoaded(true));
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!longformId && !shortformId) {
      setError('Pick at least one preset (longform or shortform).');
      return;
    }
    if (sourceType !== 'upload' && !/(?:youtube\.com|youtu\.be)\//i.test(url)) {
      setError('Paste a youtube.com or youtu.be URL.');
      return;
    }
    if (sourceType === 'upload' && !file) {
      setError('Pick a file to upload.');
      return;
    }

    setBusy(true);
    try {
      let source: unknown;
      if (sourceType === 'upload' && file) {
        const uploadId = await uploadFile(file);
        source = { type: 'upload', upload_id: uploadId, filename: file.name };
      } else {
        source = { type: sourceType, url };
      }

      const created = await api.post<CreatedRun>('/api/runs', {
        title: title || (file?.name ?? url.slice(0, 80)),
        source,
        preset_longform_id: longformId || null,
        preset_shortform_id: shortformId || null,
      });
      router.push(`/runs/${created.run.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the run.');
    } finally {
      setBusy(false);
    }
  }

  if (!presetsLoaded) {
    return null;
  }

  if (presets.length === 0) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>Create a preset first</CardTitle>
          <CardDescription>
            ClipEngine renders against your presets. Set up at least one before starting a run.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild>
            <Link href="/presets/new">Create a preset</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const longformPresets = presets.filter((p) => p.kind === 'longform');
  const shortformPresets = presets.filter((p) => p.kind === 'shortform');

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>Start a new run</CardTitle>
        <CardDescription>
          Pick a source and at least one preset. Output goes to the run&apos;s workspace and shows
          up in your runs list.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title (optional)</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What is this clip about?"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="source-type">Source</Label>
            <select
              id="source-type"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as SourceType)}
            >
              <option value="youtube_vod">YouTube VOD URL</option>
              <option value="youtube_live">YouTube live URL</option>
              <option value="upload">Upload a file</option>
            </select>
          </div>

          {sourceType === 'upload' ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="file">Video file</Label>
              <Input
                id="file"
                type="file"
                accept="video/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                required
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="longform">Longform preset</Label>
            <select
              id="longform"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={longformId}
              onChange={(e) => setLongformId(e.target.value)}
            >
              <option value="">— skip longform —</option>
              {longformPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="shortform">Shortform preset</Label>
            <select
              id="shortform"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={shortformId}
              onChange={(e) => setShortformId(e.target.value)}
            >
              <option value="">— skip shortform —</option>
              {shortformPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={busy}>
            {busy ? 'Starting…' : 'Start run'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
