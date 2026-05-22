'use client';

import { OnboardingShell } from '@/components/onboarding/shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Provider = 'tavily' | 'brave';

interface TestResult {
  ok: boolean;
  detail: string;
  latency_ms: number;
}

export default function SearchStep() {
  const router = useRouter();
  const [mainProvider, setMainProvider] = useState<Provider>('tavily');
  const [mainKey, setMainKey] = useState('');
  const [fallbackKey, setFallbackKey] = useState('');
  const [test, setTest] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [skipping, setSkipping] = useState(false);

  async function onTest() {
    setError(null);
    setTest(null);
    setBusy(true);
    try {
      const result = await api.post<TestResult>('/api/onboarding/test/search', {
        provider: mainProvider,
        api_key: mainKey,
      });
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
      const fallbackProvider: Provider = mainProvider === 'tavily' ? 'brave' : 'tavily';
      await api.patch('/api/settings/search', {
        disabled: false,
        main: { provider: mainProvider, api_key: mainKey },
        ...(fallbackKey ? { fallback: { provider: fallbackProvider, api_key: fallbackKey } } : {}),
      });
      await api.post('/api/onboarding/complete', { search_disabled: false });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  async function onSkip() {
    setError(null);
    setBusy(true);
    try {
      await api.patch('/api/settings/search', { disabled: true });
      await api.post('/api/onboarding/complete', { search_disabled: true });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
      setSkipping(false);
    }
  }

  return (
    <OnboardingShell
      current="search"
      title="Configure web search"
      description="Web search lets the LLM ground its picks in what people actually say about the source. Tavily and Brave are both supported. You can skip this — see the warning below — and enable it later."
    >
      {skipping ? (
        <Alert variant="warning">
          <AlertTitle>Skipping web search disables LLM research</AlertTitle>
          <AlertDescription>
            Without a search provider, ClipEngine can only read the transcript. The LLM won&apos;t
            know about the creator, the show, or what fans care about, so cuts are usually less
            informed. You can configure search later in Settings.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="provider">Main provider</Label>
        <select
          id="provider"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={mainProvider}
          onChange={(e) => setMainProvider(e.target.value as Provider)}
        >
          <option value="tavily">Tavily</option>
          <option value="brave">Brave</option>
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="main-key">API key</Label>
        <Input
          id="main-key"
          type="password"
          autoComplete="off"
          value={mainKey}
          onChange={(e) => setMainKey(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="fallback-key">
          Optional fallback ({mainProvider === 'tavily' ? 'Brave' : 'Tavily'}) API key
        </Label>
        <Input
          id="fallback-key"
          type="password"
          autoComplete="off"
          value={fallbackKey}
          onChange={(e) => setFallbackKey(e.target.value)}
          placeholder="Leave blank to skip"
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
        <Button type="button" variant="outline" onClick={onTest} disabled={busy || !mainKey}>
          Test connection
        </Button>
        <Button type="button" onClick={onSave} disabled={busy || !mainKey}>
          Save and finish
        </Button>
        {!skipping ? (
          <Button type="button" variant="ghost" onClick={() => setSkipping(true)} disabled={busy}>
            Skip with warning
          </Button>
        ) : (
          <Button type="button" variant="destructive" onClick={onSkip} disabled={busy}>
            Skip and disable research
          </Button>
        )}
      </div>
    </OnboardingShell>
  );
}
