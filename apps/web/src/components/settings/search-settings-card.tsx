"use client";

import { useCallback, useEffect, useState } from "react";

import { publicApiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const MASKED_API_KEY = "••••••••••";

type SearchSettingsPayload = {
  searchProviderMain: string;
  searchProviderFallback: string;
  tavilyKeyConfigured: boolean;
  braveKeyConfigured: boolean;
  exaKeyConfigured: boolean;
  firecrawlKeyConfigured: boolean;
  geminiKeyConfigured: boolean;
  xaiKeyConfigured: boolean;
  moonshotKeyConfigured: boolean;
  kimiKeyConfigured: boolean;
  minimaxKeyConfigured: boolean;
  ollamaKeyConfigured: boolean;
  perplexityKeyConfigured: boolean;
  openrouterKeyConfigured: boolean;
  searxngConfigured: boolean;
};

const MAIN_OPTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto (first configured provider)" },
  { value: "none", label: "Off (no web search)" },
  { value: "tavily", label: "Tavily" },
  { value: "brave", label: "Brave Search" },
  { value: "duckduckgo", label: "DuckDuckGo" },
  { value: "exa", label: "Exa" },
  { value: "firecrawl", label: "Firecrawl" },
  { value: "gemini", label: "Google Gemini" },
  { value: "grok", label: "xAI Grok" },
  { value: "kimi", label: "Kimi (Moonshot)" },
  { value: "minimax", label: "MiniMax" },
  { value: "ollama_web", label: "Ollama Web" },
  { value: "perplexity", label: "Perplexity" },
  { value: "searxng", label: "SearXNG" },
];

const FALLBACK_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "None" },
  ...MAIN_OPTIONS.filter((o) => o.value !== "auto" && o.value !== "none"),
];

async function jsonFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, cache: "no-store" });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = (await res.json()) as { detail?: unknown };
      if (typeof j.detail === "string") detail = j.detail;
      else if (j.detail != null) detail = JSON.stringify(j.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

type KeyField = {
  patchKey: string;
  label: string;
  configuredKey: keyof SearchSettingsPayload;
  placeholder?: string;
};

const KEY_FIELDS: KeyField[] = [
  {
    patchKey: "tavily_api_key",
    label: "Tavily API key",
    configuredKey: "tavilyKeyConfigured",
    placeholder: "tvly-…",
  },
  {
    patchKey: "brave_api_key",
    label: "Brave API key (subscription token)",
    configuredKey: "braveKeyConfigured",
  },
  {
    patchKey: "exa_api_key",
    label: "Exa API key",
    configuredKey: "exaKeyConfigured",
  },
  {
    patchKey: "firecrawl_api_key",
    label: "Firecrawl API key",
    configuredKey: "firecrawlKeyConfigured",
  },
  {
    patchKey: "gemini_api_key",
    label: "Gemini API key",
    configuredKey: "geminiKeyConfigured",
  },
  {
    patchKey: "xai_api_key",
    label: "xAI API key (Grok)",
    configuredKey: "xaiKeyConfigured",
  },
  {
    patchKey: "moonshot_api_key",
    label: "Moonshot API key (Kimi)",
    configuredKey: "moonshotKeyConfigured",
  },
  {
    patchKey: "kimi_api_key",
    label: "Kimi API key (alternate)",
    configuredKey: "kimiKeyConfigured",
  },
  {
    patchKey: "minimax_api_key",
    label: "MiniMax API key",
    configuredKey: "minimaxKeyConfigured",
  },
  {
    patchKey: "ollama_api_key",
    label: "Ollama API key (web search)",
    configuredKey: "ollamaKeyConfigured",
  },
  {
    patchKey: "perplexity_api_key",
    label: "Perplexity API key",
    configuredKey: "perplexityKeyConfigured",
  },
  {
    patchKey: "openrouter_api_key",
    label: "OpenRouter API key (Perplexity via OpenRouter)",
    configuredKey: "openrouterKeyConfigured",
  },
  {
    patchKey: "searxng_base_url",
    label: "SearXNG base URL",
    configuredKey: "searxngConfigured",
    placeholder: "https://search.example.com",
  },
];

export function SearchSettingsCard({
  onSaved,
}: {
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [main, setMain] = useState("auto");
  const [fallback, setFallback] = useState("none");
  const [duckduckgoBackend, setDuckduckgoBackend] = useState("auto");
  const [braveCountry, setBraveCountry] = useState("");

  const [payload, setPayload] = useState<SearchSettingsPayload | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await jsonFetch<SearchSettingsPayload & Record<string, unknown>>(
        publicApiUrl("/api/settings"),
      );
      setPayload({
        searchProviderMain: String(d.searchProviderMain ?? "auto"),
        searchProviderFallback: String(d.searchProviderFallback ?? "none"),
        tavilyKeyConfigured: Boolean(d.tavilyKeyConfigured),
        braveKeyConfigured: Boolean(d.braveKeyConfigured),
        exaKeyConfigured: Boolean(d.exaKeyConfigured),
        firecrawlKeyConfigured: Boolean(d.firecrawlKeyConfigured),
        geminiKeyConfigured: Boolean(d.geminiKeyConfigured),
        xaiKeyConfigured: Boolean(d.xaiKeyConfigured),
        moonshotKeyConfigured: Boolean(d.moonshotKeyConfigured),
        kimiKeyConfigured: Boolean(d.kimiKeyConfigured),
        minimaxKeyConfigured: Boolean(d.minimaxKeyConfigured),
        ollamaKeyConfigured: Boolean(d.ollamaKeyConfigured),
        perplexityKeyConfigured: Boolean(d.perplexityKeyConfigured),
        openrouterKeyConfigured: Boolean(d.openrouterKeyConfigured),
        searxngConfigured: Boolean(d.searxngConfigured),
      });
      setMain(String(d.searchProviderMain ?? "auto"));
      setFallback(String(d.searchProviderFallback ?? "none"));
      setDuckduckgoBackend(String(d.duckduckgoBackend ?? "auto"));
      setBraveCountry(String(d.braveSearchCountry ?? ""));
      setKeys({});
      setTouched({});
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load search settings");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function isConfigured(field: KeyField): boolean {
    if (!payload) return false;
    return Boolean(payload[field.configuredKey]);
  }

  async function save() {
    setError(null);
    setPending(true);
    try {
      const body: Record<string, unknown> = {
        search_provider_main: main,
        search_provider_fallback: fallback,
        duckduckgo_backend: duckduckgoBackend || "auto",
        brave_search_country: braveCountry.trim(),
      };
      for (const f of KEY_FIELDS) {
        const v = keys[f.patchKey]?.trim();
        if (v) body[f.patchKey] = v;
      }
      await jsonFetch(publicApiUrl("/api/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setKeys({});
      setTouched({});
      await load();
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  async function clearSecret(patchKey: string) {
    setError(null);
    setPending(true);
    try {
      await jsonFetch(publicApiUrl("/api/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear_search_secrets: [patchKey] }),
      });
      setKeys((prev) => ({ ...prev, [patchKey]: "" }));
      setTouched((prev) => ({ ...prev, [patchKey]: false }));
      await load();
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear");
    } finally {
      setPending(false);
    }
  }

  if (!loaded && !error) {
    return <p className="text-sm text-muted-foreground">Loading search settings…</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Web search</CardTitle>
        <CardDescription>
          Configure <strong>main</strong> and optional <strong>fallback</strong> providers for the
          plan step. API keys are stored in SQLite on this host. When main is{" "}
          <span className="font-mono">auto</span>, the first provider with credentials wins (same
          order as the engine). Fallback runs if the main provider returns no text or errors.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Main provider</span>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={main}
              onChange={(e) => setMain(e.target.value)}
            >
              {MAIN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Fallback provider</span>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={fallback}
              onChange={(e) => setFallback(e.target.value)}
            >
              {FALLBACK_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">DuckDuckGo backend</span>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={duckduckgoBackend}
              onChange={(e) => setDuckduckgoBackend(e.target.value)}
            >
              <option value="auto">Auto (instant API, then optional package)</option>
              <option value="instant">Instant Answer API only</option>
              <option value="package">duckduckgo-search package only</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Brave country (ISO-3166, optional)</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={braveCountry}
              onChange={(e) => setBraveCountry(e.target.value)}
              placeholder="US"
              maxLength={8}
            />
          </label>
        </div>

        <div className="space-y-4">
          <p className="text-sm font-medium">Provider credentials</p>
          <p className="text-xs text-muted-foreground">
            Only fill keys for providers you use. Leave blank to keep an existing stored value.
          </p>
          <div className="space-y-4">
            {KEY_FIELDS.map((f) => {
              const configured = isConfigured(f);
              const t = touched[f.patchKey];
              const val = keys[f.patchKey] ?? "";
              return (
                <div
                  key={f.patchKey}
                  className="space-y-1.5 rounded-lg border border-border/60 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">{f.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {configured ? "stored" : "not set"}
                    </span>
                  </div>
                  <input
                    type="password"
                    autoComplete="off"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder={f.placeholder}
                    value={configured && !t ? MASKED_API_KEY : val}
                    onFocus={() =>
                      setTouched((prev) => ({ ...prev, [f.patchKey]: true }))
                    }
                    onBlur={() => {
                      if (!val && configured) {
                        setTouched((prev) => ({ ...prev, [f.patchKey]: false }));
                      }
                    }}
                    onChange={(e) =>
                      setKeys((prev) => ({ ...prev, [f.patchKey]: e.target.value }))
                    }
                  />
                  {configured ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => void clearSecret(f.patchKey)}
                    >
                      Remove stored value
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={() => void save()}>
            {pending ? "Saving…" : "Save search settings"}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void load()}>
            Reload
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
