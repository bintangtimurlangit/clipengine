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
import { YouTubeSettingsCard } from "@/components/settings/youtube-settings-card";
import { S3SettingsCard } from "@/components/settings/s3-settings-card";
import { SmbSettingsCard } from "@/components/settings/smb-settings-card";
import { LocalBindSettingsCard } from "@/components/settings/local-bind-settings-card";
import { TelegramNotificationsCard } from "@/components/settings/telegram-notifications-card";
import { PublishingSettingsCard } from "@/components/settings/publishing-settings-card";
import { SearchSettingsCard } from "@/components/settings/search-settings-card";

type SettingsResponse = {
  llmProvider: "openai" | "anthropic";
  transcriptionBackend: "local" | "openai_api";
  openaiBaseUrl: string;
  openaiModel: string;
  openaiKeyConfigured: boolean;
  anthropicBaseUrl: string;
  anthropicModel: string;
  anthropicKeyConfigured: boolean;
  workspacePath: string;
  dataPath: string;
  longformMinS: number;
  longformMaxS: number;
  shortformMinS: number;
  shortformMaxS: number;
  snapDurationSlackS: number;
  maxUploadBytes: number;
};

type SettingsSectionId =
  | "path"
  | "storage-google-drive"
  | "storage-youtube"
  | "storage-s3"
  | "storage-smb"
  | "storage-local-bind"
  | "llm"
  | "transcription"
  | "pipeline"
  | "publishing"
  | "search"
  | "notifications";

const STORAGE_CHILDREN: { id: SettingsSectionId; label: string }[] = [
  { id: "storage-google-drive", label: "Google Drive" },
  { id: "storage-youtube", label: "YouTube" },
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
  const [transcriptionBackend, setTranscriptionBackend] = useState<
    "local" | "openai_api"
  >("local");
  const [llmProvider, setLlmProvider] = useState<"openai" | "anthropic">("openai");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiKeyTouched, setOpenaiKeyTouched] = useState(false);
  const [anthropicBaseUrl, setAnthropicBaseUrl] = useState("");
  const [anthropicModel, setAnthropicModel] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [anthropicKeyTouched, setAnthropicKeyTouched] = useState(false);
  const [workspacePath, setWorkspacePath] = useState("");
  const [dataPath, setDataPath] = useState("");

  const [longformMinS, setLongformMinS] = useState(180);
  const [longformMaxS, setLongformMaxS] = useState(360);
  const [shortformMinS, setShortformMinS] = useState(27);
  const [shortformMaxS, setShortformMaxS] = useState(80);
  const [snapDurationSlackS, setSnapDurationSlackS] = useState(3);
  const [maxUploadGiB, setMaxUploadGiB] = useState(5);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await jsonFetch<SettingsResponse>(publicApiUrl("/api/settings"));
      setTranscriptionBackend(
        d.transcriptionBackend === "openai_api" ? "openai_api" : "local",
      );
      setLlmProvider(d.llmProvider === "anthropic" ? "anthropic" : "openai");
      setOpenaiBaseUrl(d.openaiBaseUrl);
      setOpenaiModel(d.openaiModel || "gpt-4o-mini");
      setAnthropicBaseUrl(d.anthropicBaseUrl);
      setAnthropicModel(d.anthropicModel || "claude-3-5-sonnet-20241022");
      setWorkspacePath(d.workspacePath);
      setDataPath(d.dataPath);
      setOpenaiKeyConfigured(d.openaiKeyConfigured);
      setAnthropicKeyConfigured(d.anthropicKeyConfigured);
      setLongformMinS(d.longformMinS ?? 180);
      setLongformMaxS(d.longformMaxS ?? 360);
      setShortformMinS(d.shortformMinS ?? 27);
      setShortformMaxS(d.shortformMaxS ?? 80);
      setSnapDurationSlackS(d.snapDurationSlackS ?? 3);
      setMaxUploadGiB(
        d.maxUploadBytes != null ? d.maxUploadBytes / 1024 ** 3 : 5,
      );
      setOpenaiKey("");
      setOpenaiKeyTouched(false);
      setAnthropicKey("");
      setAnthropicKeyTouched(false);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveTranscriptionSettings() {
    setError(null);
    setSaved(null);
    setPending(true);
    try {
      await jsonFetch(publicApiUrl("/api/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcription_backend: transcriptionBackend,
        }),
      });
      setSaved("Transcription settings saved. They apply to the next pipeline run.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

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

  async function savePipelineSettings() {
    setError(null);
    setSaved(null);
    setPending(true);
    try {
      const maxBytes = Math.round(maxUploadGiB * 1024 ** 3);
      await jsonFetch(publicApiUrl("/api/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          longform_min_s: longformMinS,
          longform_max_s: longformMaxS,
          shortform_min_s: shortformMinS,
          shortform_max_s: shortformMaxS,
          snap_duration_slack_s: snapDurationSlackS,
          max_upload_bytes: maxBytes,
        }),
      });
      setSaved("Pipeline settings saved. They apply to the next pipeline run.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  async function clearKey(kind: "openai" | "anthropic") {
    setError(null);
    setSaved(null);
    setPending(true);
    try {
      const body =
        kind === "openai"
          ? { clear_openai_api_key: true }
          : { clear_anthropic_api_key: true };
      await jsonFetch(publicApiUrl("/api/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSaved("Stored key removed.");
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
              onClick={() => setSection("transcription")}
              className={cn(
                "rounded-md px-3 py-2 text-left text-sm transition-colors md:w-full",
                section === "transcription"
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              Transcription
            </button>
            <button
              type="button"
              onClick={() => setSection("pipeline")}
              className={cn(
                "rounded-md px-3 py-2 text-left text-sm transition-colors md:w-full",
                section === "pipeline"
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              Pipeline
            </button>
            <button
              type="button"
              onClick={() => setSection("publishing")}
              className={cn(
                "rounded-md px-3 py-2 text-left text-sm transition-colors md:w-full",
                section === "publishing"
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              Publishing
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
            <button
              type="button"
              onClick={() => setSection("notifications")}
              className={cn(
                "rounded-md px-3 py-2 text-left text-sm transition-colors md:w-full",
                section === "notifications"
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              Notifications
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
        {saved &&
        (section === "llm" ||
          section === "transcription" ||
          section === "pipeline" ||
          section === "publishing" ||
          section === "search") ? (
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
        {section === "storage-youtube" ? <YouTubeSettingsCard /> : null}
        {section === "storage-s3" ? <S3SettingsCard /> : null}
        {section === "storage-smb" ? <SmbSettingsCard /> : null}
        {section === "storage-local-bind" ? <LocalBindSettingsCard /> : null}

        {section === "publishing" ? <PublishingSettingsCard /> : null}

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

        {section === "transcription" ? (
          <Card>
            <CardHeader>
              <CardTitle>Transcription (ingest)</CardTitle>
              <CardDescription>
                Choose how speech is turned into <code className="text-xs">transcript.json</code>{" "}
                during <strong>ingest</strong>. OpenAI mode uses the same API key and base URL as{" "}
                <strong>LLM → OpenAI-compatible</strong> (see{" "}
                <a
                  className="text-primary underline-offset-4 hover:underline"
                  href="https://platform.openai.com/docs/guides/speech-to-text"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  OpenAI speech-to-text
                </a>
                ).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="transcription"
                    checked={transcriptionBackend === "local"}
                    onChange={() => setTranscriptionBackend("local")}
                  />
                  Local (faster-whisper, tiny)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="transcription"
                    checked={transcriptionBackend === "openai_api"}
                    onChange={() => setTranscriptionBackend("openai_api")}
                  />
                  OpenAI API (whisper-1)
                </label>
              </div>
              {transcriptionBackend === "openai_api" ? (
                <p className="text-xs text-muted-foreground">
                  OpenAI key status:{" "}
                  {openaiKeyConfigured ? (
                    <span className="text-foreground">configured</span>
                  ) : (
                    <span className="text-destructive">not set — add a key under LLM</span>
                  )}
                  . Long audio is split into chunks under the API size limit.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Runs on this machine with the tiny model (default). GPU is used when available.
                </p>
              )}
              <Button
                type="button"
                disabled={pending}
                onClick={() => void saveTranscriptionSettings()}
              >
                {pending ? "Saving…" : "Save transcription settings"}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {section === "pipeline" ? (
          <Card>
            <CardHeader>
              <CardTitle>Pipeline</CardTitle>
              <CardDescription>
                Clip duration bounds for <strong>plan</strong> and <strong>render</strong> (snap to
                transcript), plus the maximum source file size for <strong>upload</strong> runs.
                Values are stored in SQLite and override empty environment variables for this
                instance.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <p className="mb-3 text-sm font-medium">Longform (16:9)</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted-foreground">Min duration (seconds)</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={longformMinS}
                      onChange={(e) => setLongformMinS(Number(e.target.value))}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted-foreground">Max duration (seconds)</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={longformMaxS}
                      onChange={(e) => setLongformMaxS(Number(e.target.value))}
                    />
                  </label>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Defaults: 180s–360s. The LLM and sanitizer enforce these bounds.
                </p>
              </div>
              <div>
                <p className="mb-3 text-sm font-medium">Shortform (9:16)</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted-foreground">Min duration (seconds)</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={shortformMinS}
                      onChange={(e) => setShortformMinS(Number(e.target.value))}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted-foreground">Max duration (seconds)</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={shortformMaxS}
                      onChange={(e) => setShortformMaxS(Number(e.target.value))}
                    />
                  </label>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Defaults: 27s–80s. Shorts stay near one minute with slack for clean cuts.
                </p>
              </div>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">
                  Snap duration slack (seconds)
                </span>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  className="max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={snapDurationSlackS}
                  onChange={(e) => setSnapDurationSlackS(Number(e.target.value))}
                />
                <span className="text-xs text-muted-foreground">
                  Allowed drift after snapping clip boundaries to transcript segments (default 3s).
                </span>
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Max upload size (GiB)</span>
                <input
                  type="number"
                  min={0.001}
                  step={0.1}
                  className="max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={maxUploadGiB}
                  onChange={(e) => setMaxUploadGiB(Number(e.target.value))}
                />
                <span className="text-xs text-muted-foreground">
                  Applies to browser uploads only. Range 1 MiB–50 GiB (enforced server-side).
                </span>
              </label>
              <Button
                type="button"
                disabled={pending}
                onClick={() => void savePipelineSettings()}
              >
                {pending ? "Saving…" : "Save pipeline settings"}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {section === "search" ? (
          <SearchSettingsCard
            onSaved={async () => {
              setSaved("Search settings saved. They apply to the next pipeline run.");
              await load();
            }}
          />
        ) : null}

        {section === "notifications" ? <TelegramNotificationsCard /> : null}
      </div>
    </div>
  );
}
