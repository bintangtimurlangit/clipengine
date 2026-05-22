'use client';

import { OnboardingShell } from '@/components/onboarding/shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Backend = 'local' | 'openai' | 'openai_compatible';

interface TestResult {
  ok: boolean;
  detail: string;
  latency_ms: number;
}

export default function TranscriptionStep() {
  const router = useRouter();
  const [backend, setBackend] = useState<Backend>('local');
  const [model, setModel] = useState('base');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [language, setLanguage] = useState('');
  const [test, setTest] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function buildSettings() {
    if (backend === 'local') {
      return {
        backend,
        model,
        language: language.trim() || null,
      };
    }
    if (backend === 'openai') {
      return {
        backend,
        api_key: apiKey,
        model: model || 'whisper-1',
        language: language.trim() || null,
      };
    }
    return {
      backend,
      api_key: apiKey,
      base_url: baseUrl,
      model,
      language: language.trim() || null,
    };
  }

  async function onTest() {
    setError(null);
    setTest(null);
    setBusy(true);
    try {
      const result = await api.post<TestResult>(
        '/api/onboarding/test/transcription',
        buildSettings(),
      );
      setTest(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Test failed.');
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    setError(null);
    setBusy(true);
    try {
      await api.patch('/api/settings/transcription', buildSettings());
      router.push('/onboarding/llm');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingShell
      current="transcription"
      title="Pick how ClipEngine transcribes audio"
      description="Required. The transcript drives every later stage — Whisper at home or any compatible API."
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="backend">Backend</Label>
        <select
          id="backend"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={backend}
          onChange={(e) => setBackend(e.target.value as Backend)}
        >
          <option value="local">Local Whisper (free, runs on this server)</option>
          <option value="openai">OpenAI Whisper API</option>
          <option value="openai_compatible">Custom OpenAI-compatible endpoint</option>
        </select>
      </div>

      {backend === 'local' ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="model">Model</Label>
          <select
            id="model"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="tiny">tiny (~75 MB)</option>
            <option value="base">base (~150 MB, recommended)</option>
            <option value="small">small (~500 MB)</option>
            <option value="medium">medium (~1.5 GB)</option>
            <option value="large-v3">large-v3 (~3 GB)</option>
          </select>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="api-key">API key</Label>
            <Input
              id="api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
            />
          </div>
          {backend === 'openai_compatible' ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="base-url">Base URL</Label>
              <Input
                id="base-url"
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://your-server/v1"
                required
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={backend === 'openai' ? 'whisper-1' : 'whisper-large-v3'}
            />
          </div>
        </>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="language">Language (optional)</Label>
        <Input
          id="language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          placeholder="en — leave blank to auto-detect"
        />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {test ? (
        <Alert variant={test.ok ? 'default' : 'destructive'}>
          <AlertDescription>
            {test.detail} ({test.latency_ms} ms)
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={onTest} disabled={busy}>
          Test connection
        </Button>
        <Button type="button" onClick={onSave} disabled={busy}>
          Save and continue
        </Button>
      </div>
    </OnboardingShell>
  );
}
