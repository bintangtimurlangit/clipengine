'use client';

import { OnboardingShell } from '@/components/onboarding/shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Preset = 'openai' | 'anthropic' | 'minimax' | 'custom';

const DEFAULTS: Record<
  Preset,
  { provider: 'openai' | 'anthropic' | 'openai_compatible'; model: string; baseUrl?: string }
> = {
  openai: { provider: 'openai', model: 'gpt-4o-mini' },
  anthropic: { provider: 'anthropic', model: 'claude-haiku-4-5' },
  minimax: {
    provider: 'openai_compatible',
    model: 'abab6.5s-chat',
    baseUrl: 'https://api.minimax.chat/v1',
  },
  custom: { provider: 'openai_compatible', model: '', baseUrl: '' },
};

interface TestResult {
  ok: boolean;
  detail: string;
  latency_ms: number;
}

function uuid(): string {
  // Browser/Node both ship `crypto.randomUUID` in modern runtimes.
  return crypto.randomUUID();
}

export default function LlmStep() {
  const router = useRouter();
  const [preset, setPreset] = useState<Preset>('openai');
  const [model, setModel] = useState(DEFAULTS.openai.model);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [test, setTest] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pick(next: Preset) {
    setPreset(next);
    setModel(DEFAULTS[next].model);
    setBaseUrl(DEFAULTS[next].baseUrl ?? '');
  }

  function buildProfile() {
    const config = DEFAULTS[preset];
    return {
      id: uuid(),
      label: `${preset[0]?.toUpperCase()}${preset.slice(1)} primary`,
      provider: config.provider,
      preset,
      api_key: apiKey,
      ...(config.provider === 'openai_compatible' || baseUrl ? { base_url: baseUrl } : {}),
      model,
    };
  }

  async function onTest() {
    setError(null);
    setTest(null);
    setBusy(true);
    try {
      const result = await api.post<TestResult>('/api/onboarding/test/llm', buildProfile());
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
      const profile = buildProfile();
      await api.patch('/api/settings/llm', { primary: profile, fallbacks: [] });
      router.push('/onboarding/search');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingShell
      current="llm"
      title="Pick a language model"
      description="Required. ClipEngine asks the LLM to read the transcript and choose moments worth clipping."
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="preset">Provider</Label>
        <select
          id="preset"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={preset}
          onChange={(e) => pick(e.target.value as Preset)}
        >
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="minimax">Minimax</option>
          <option value="custom">Custom (OpenAI-compatible)</option>
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="model">Model</Label>
        <Input
          id="model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={DEFAULTS[preset].model}
          required
        />
      </div>

      {DEFAULTS[preset].provider === 'openai_compatible' || preset === 'minimax' ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="base-url">Base URL</Label>
          <Input
            id="base-url"
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.minimax.chat/v1"
            required
          />
        </div>
      ) : null}

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
