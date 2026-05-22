import { describe, expect, it, vi } from 'vitest';
import { createBraveProvider } from '../src/brave.js';
import { runSearchChain } from '../src/chain.js';

const braveResponse = {
  web: {
    results: [
      {
        title: 'ClipEngine docs',
        url: 'https://example.com/docs',
        description: 'How clip engines work.',
      },
      {
        title: 'Second hit',
        url: 'https://example.com/2',
        description: 'More info.',
      },
    ],
  },
};

function fakeBraveFetch(captured: { url?: string; init?: RequestInit }): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    captured.url = typeof url === 'string' ? url : url.toString();
    captured.init = init;
    return new Response(JSON.stringify(braveResponse), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

describe('createBraveProvider', () => {
  it('issues a GET to /web/search and parses results', async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    const provider = createBraveProvider({
      apiKey: 'brave-key',
      fetchImpl: fakeBraveFetch(captured),
    });
    const res = await provider.search('long video creators');
    expect(captured.url).toContain('/web/search?');
    expect(captured.url).toContain('q=long+video+creators');
    const headers = captured.init?.headers as Record<string, string>;
    expect(headers['X-Subscription-Token']).toBe('brave-key');
    expect(res.provider).toBe('brave');
    expect(res.results).toHaveLength(2);
    expect(res.results[0]?.title).toBe('ClipEngine docs');
  });

  it('throws on a non-2xx response', async () => {
    const fetchImpl = (async () => new Response('forbidden', { status: 403 })) as typeof fetch;
    const provider = createBraveProvider({ apiKey: 'bad', fetchImpl });
    await expect(provider.search('q')).rejects.toThrow(/brave: 403/);
  });
});

describe('runSearchChain', () => {
  it('returns null when search is disabled', async () => {
    const result = await runSearchChain({ disabled: true }, 'anything');
    expect(result).toBeNull();
  });

  it('uses the main provider when it succeeds', async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    const result = await runSearchChain(
      {
        disabled: false,
        main: { provider: 'brave', api_key: 'main-key' },
      },
      'creators',
      undefined,
      { fetchImpl: fakeBraveFetch(captured) },
    );
    expect(result).not.toBeNull();
    expect(result?.response.provider).toBe('brave');
    expect(result?.attempts).toHaveLength(1);
    expect(result?.attempts[0]?.ok).toBe(true);
  });

  it('falls back when the main provider errors', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = (async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url.toString();
      calls.push(u);
      // First call (main key) fails, second call (fallback key) succeeds.
      if (calls.length === 1) {
        return new Response('rate limited', { status: 429 });
      }
      return new Response(JSON.stringify(braveResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const result = await runSearchChain(
      {
        disabled: false,
        main: { provider: 'brave', api_key: 'main-key' },
        fallback: { provider: 'brave', api_key: 'fallback-key' },
      },
      'creators',
      undefined,
      { fetchImpl },
    );
    expect(calls).toHaveLength(2);
    expect(result?.attempts).toHaveLength(2);
    expect(result?.attempts[0]?.ok).toBe(false);
    expect(result?.attempts[1]?.ok).toBe(true);
  });

  it('returns null when every provider fails', async () => {
    const fetchImpl = (async () => new Response('boom', { status: 500 })) as typeof fetch;
    const result = await runSearchChain(
      {
        disabled: false,
        main: { provider: 'brave', api_key: 'main-key' },
      },
      'q',
      undefined,
      { fetchImpl },
    );
    expect(result).toBeNull();
  });

  it('respects an aborted signal before any request', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();
    const result = await runSearchChain(
      {
        disabled: false,
        main: { provider: 'brave', api_key: 'main-key' },
      },
      'q',
      controller.signal,
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    // Brave's fetch will throw AbortError; the chain treats it as
    // a normal failed attempt and returns null.
    expect(result).toBeNull();
  });
});
