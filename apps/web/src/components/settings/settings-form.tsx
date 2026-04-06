"use client";

import { useCallback, useEffect, useState } from "react";

import { publicApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { GoogleDriveSettingsCard } from "@/components/settings/google-drive-settings-card";
import { S3SettingsCard } from "@/components/settings/s3-settings-card";
import { SmbSettingsCard } from "@/components/settings/smb-settings-card";
import { LocalBindSettingsCard } from "@/components/settings/local-bind-settings-card";

type SettingsResponse = {
  llmProvider: "openai" | "anthropic";
  openaiBaseUrl: string;
  openaiModel: string;
  openaiKeyConfigured: boolean;
  anthropicBaseUrl: string;
  anthropicModel: string;
  anthropicKeyConfigured: boolean;
  tavilyKeyConfigured: boolean;
  workspacePath: string;
  dataPath: string;
};

type SettingsSectionId =
  | "path"
  | "storage-google-drive"
  | "storage-s3"
  | "storage-smb"
  | "storage-local-bind"
  | "llm"
  | "search";

const STORAGE_CHILDREN: { id: SettingsSectionId; label: string }[] = [
  { id: "storage-google-drive", label: "Google Drive" },
  { id: "storage-s3", label: "S3" },
  { id: "storage-smb", label: "SMB" },
  { id: "storage-local-bind", label: "Local path" },
];

/** Shown when a key exists server-side but the user has not started editing (not the real secret). */
const MASKED_API_KEY = "••••••••••";

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

export function SettingsForm() {
  const [section, setSection] = useState<SettingsSectionId>("llm");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [openaiKeyConfigured, setOpenaiKeyConfigured] = useState(false);
  const [anthropicKeyConfigured, setAnthropicKeyConfigured] = useState(false);
  const [tavilyKeyConfigured, setTavilyKeyConfigured] = useState(false);

  const [llmProvider, setLlmProvider] = useState<"openai" | "anthropic">("openai");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiKeyTouched, setOpenaiKeyTouched] = useState(false);
  const [anthropicBaseUrl, setAnthropicBaseUrl] = useState("");
  const [anthropicModel, setAnthropicModel] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [anthropicKeyTouched, setAnthropicKeyTouched] = useState(false);
  const [tavilyKey, setTavilyKey] = useState("");
  const [tavilyKeyTouched, setTavilyKeyTouched] = useState(false);
  const [workspacePath, setWorkspacePath] = useState("");
  const [dataPath, setDataPath] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await jsonFetch<SettingsResponse>(publicApiUrl("/api/settings"));
      setLlmProvider(d.llmProvider === "anthropic" ? "anthropic" : "openai");
      setOpenaiBaseUrl(d.openaiBaseUrl);
      setOpenaiModel(d.openaiModel || "gpt-4o-mini");
      setAnthropicBaseUrl(d.anthropicBaseUrl);
      setAnthropicModel(d.anthropicModel || "claude-3-5-sonnet-20241022");
      setWorkspacePath(d.workspacePath);
      setDataPath(d.dataPath);
      setOpenaiKeyConfigured(d.openaiKeyConfigured);
      setAnthropicKeyConfigured(d.anthropicKeyConfigured);
      setTavilyKeyConfigured(d.tavilyKeyConfigured);
      setOpenaiKey("");
      setOpenaiKeyTouched(false);
      setAnthropicKey("");
      setAnthropicKeyTouched(false);
      setTavilyKey("");
      setTavilyKeyTouched(false);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveLlmSettings() {
    setError(null);
    setSaved(null);
    setPending(true);
    try {
      const body: Record<string, unknown> = {
        llm_provider: llmProvider,
        openai_base_url: openaiBaseUrl,
        openai_model: openaiModel,
        anthropic_base_url: anthropicBaseUrl,
        anthropic_model: anthropicModel,
      };
      if (openaiKey.trim()) body.openai_api_key = openaiKey.trim();
      if (anthropicKey.trim()) body.anthropic_api_key = anthropicKey.trim();

      await jsonFetch(publicApiUrl("/api/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setOpenaiKey("");
      setOpenaiKeyTouched(false);
      setAnthropicKey("");
      setAnthropicKeyTouched(false);
      setSaved("LLM settings saved. They apply to the next pipeline run.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  async function saveSearchSettings() {
    setError(null);
    setSaved(null);
    setPending(true);
    try {
      const body: Record<string, unknown> = {};
      if (tavilyKey.trim()) body.tavily_api_key = tavilyKey.trim();
      await jsonFetch(publicApiUrl("/api/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setTavilyKey("");
      setTavilyKeyTouched(false);
      setSaved("Search settings saved. They apply to the next pipeline run.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  async function clearKey(kind: "openai" | "anthropic" | "tavily") {
    setError(null);
    setSaved(null);
    setPending(true);
    try {
      const body =
        kind === "openai"
          ? { clear_openai_api_key: true }
          : kind === "anthropic"
            ? { clear_anthropic_api_key: true }
            : { clear_tavily_api_key: true };
      await jsonFetch(publicApiUrl("/api/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSaved(
        kind === "tavily"
          ? "Stored Tavily key removed."
          : "Stored key removed.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear");
    } finally {
      setPending(false);
    }
  }

  if (!loaded && !error) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-10">
      {/* Section nav: stacked on top on small screens, fixed-width column from md up */}
      <aside className="w-full shrink-0 md:w-52">
        <nav className="sticky top-4 rounded-lg border border-border bg-muted/20 p-2">
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setSection("path")}
              className={cn(
                "rounded-md px-3 py-2 text-left text-sm transition-colors md:w-full",
                section === "path"
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              Path
            </button>

            <div className="rounded-md py-1">
              <p className="px-3 pb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Storage
              </p>
              <div className="ml-2 flex flex-col gap-0.5 border-l border-border pl-2">
                {STORAGE_CHILDREN.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSection(s.id)}
                    className={cn(
                      "rounded-md px-2 py-1.5 text-left text-sm transition-colors md:w-full",
                      section === s.id
                        ? "bg-background font-medium text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSection("llm")}
              className={cn(
                "rounded-md px-3 py-2 text-left text-sm transition-colors md:w-full",
                section === "llm"
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              LLM
            </button>
            <button
              type="button"
              onClick={() => setSection("search")}
              className={cn(
                "rounded-md px-3 py-2 text-left text-sm transition-colors md:w-full",
                section === "search"
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              Search
            </button>
          </div>
        </nav>
      </aside>

      {/* Main panel */}
      <div className="min-w-0 flex-1 space-y-4">
        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {saved && (section === "llm" || section === "search") ? (
          <p className="rounded-md border border-border bg-muted/50 p-3 text-sm text-foreground">
            {saved}
          </p>
        ) : null}

        {section === "path" ? (
          <Card>
            <CardHeader>
              <CardTitle>Path (read-only)</CardTitle>
              <CardDescription>
                From environment / Docker. Job files live under the workspace volume.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 font-mono text-xs text-muted-foreground">
              <p>
                <span className="text-foreground">Workspace:</span> {workspacePath}
              </p>
              <p>
                <span className="text-foreground">Data (SQLite):</span> {dataPath}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {section === "storage-google-drive" ? <GoogleDriveSettingsCard /> : null}
        {section === "storage-s3" ? <S3SettingsCard /> : null}
        {section === "storage-smb" ? <SmbSettingsCard /> : null}
        {section === "storage-local-bind" ? <LocalBindSettingsCard /> : null}

        {section === "llm" ? (
          <div className="space-y-0">
            <Card>
              <CardHeader>
                <CardTitle>LLM</CardTitle>
                <CardDescription>
                  Choose your backend for <strong>plan</strong>. API keys are stored in SQLite on
                  this machine—treat the host as trusted.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-wrap gap-4">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="llm"
                      checked={llmProvider === "openai"}
                      onChange={() => setLlmProvider("openai")}
                    />
                    OpenAI-compatible
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="llm"
                      checked={llmProvider === "anthropic"}
                      onChange={() => setLlmProvider("anthropic")}
                    />
                    Anthropic Messages
                  </label>
                </div>

                <div className="space-y-3 rounded-lg border border-border p-4">
                  <p className="text-sm font-medium">OpenAI-compatible</p>
                  <p className="text-xs text-muted-foreground">
                    Key status: {openaiKeyConfigured ? "configured" : "not set"}
                  </p>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted-foreground">Base URL (optional)</span>
                    <input
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={openaiBaseUrl}
                      onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                      placeholder="https://api.openai.com/v1"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted-foreground">Model</span>
                    <input
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={openaiModel}
                      onChange={(e) => setOpenaiModel(e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted-foreground">
                      API key (leave blank to keep existing)
                    </span>
                    <input
                      type="password"
                      autoComplete="off"
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={
                        openaiKeyConfigured && !openaiKeyTouched
                          ? MASKED_API_KEY
                          : openaiKey
                      }
                      onFocus={() => setOpenaiKeyTouched(true)}
                      onBlur={() => {
                        if (openaiKey === "" && openaiKeyConfigured) {
                          setOpenaiKeyTouched(false);
                        }
                      }}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                    />
                  </label>
                  {openaiKeyConfigured ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => void clearKey("openai")}
                    >
                      Remove stored OpenAI key
                    </Button>
                  ) : null}
                </div>

                <div className="space-y-3 rounded-lg border border-border p-4">
                  <p className="text-sm font-medium">Anthropic</p>
                  <p className="text-xs text-muted-foreground">
                    Key status: {anthropicKeyConfigured ? "configured" : "not set"}
                  </p>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted-foreground">Base URL (optional)</span>
                    <input
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={anthropicBaseUrl}
                      onChange={(e) => setAnthropicBaseUrl(e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted-foreground">Model</span>
                    <input
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={anthropicModel}
                      onChange={(e) => setAnthropicModel(e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted-foreground">
                      API key (leave blank to keep existing)
                    </span>
                    <input
                      type="password"
                      autoComplete="off"
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={
                        anthropicKeyConfigured && !anthropicKeyTouched
                          ? MASKED_API_KEY
                          : anthropicKey
                      }
                      onFocus={() => setAnthropicKeyTouched(true)}
                      onBlur={() => {
                        if (anthropicKey === "" && anthropicKeyConfigured) {
                          setAnthropicKeyTouched(false);
                        }
                      }}
                      onChange={(e) => setAnthropicKey(e.target.value)}
                    />
                  </label>
                  {anthropicKeyConfigured ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => void clearKey("anthropic")}
                    >
                      Remove stored Anthropic key
                    </Button>
                  ) : null}
                </div>

                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => void saveLlmSettings()}
                >
                  {pending ? "Saving…" : "Save LLM settings"}
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {section === "search" ? (
          <div className="space-y-0">
            <Card>
              <CardHeader>
                <CardTitle>Search</CardTitle>
                <CardDescription>
                  Web search during <strong>plan</strong> uses{" "}
                  <strong>Tavily</strong> as the search provider. The API key is stored in SQLite on
                  this host.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Key status: {tavilyKeyConfigured ? "configured" : "not set"}
                </p>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Tavily API key</span>
                  <input
                    type="password"
                    autoComplete="off"
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={
                      tavilyKeyConfigured && !tavilyKeyTouched
                        ? MASKED_API_KEY
                        : tavilyKey
                    }
                    onFocus={() => setTavilyKeyTouched(true)}
                    onBlur={() => {
                      if (tavilyKey === "" && tavilyKeyConfigured) {
                        setTavilyKeyTouched(false);
                      }
                    }}
                    onChange={(e) => setTavilyKey(e.target.value)}
                    placeholder="tvly-…"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() => void saveSearchSettings()}
                  >
                    {pending ? "Saving…" : "Save search settings"}
                  </Button>
                  {tavilyKeyConfigured ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => void clearKey("tavily")}
                    >
                      Remove stored key
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
