"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

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

type LlmProfileApi = {
  id: string;
  label: string;
  provider: "openai" | "anthropic";
  baseUrl: string;
  model: string;
  keyConfigured: boolean;
};

type SettingsResponse = {
  llmProfiles?: LlmProfileApi[];
  llmPrimaryId?: string;
  llmFallbackIds?: string[];
  llmProvider: "openai" | "anthropic";
  transcriptionBackend: "local" | "openai_api" | "assemblyai";
  assemblyaiKeyConfigured?: boolean;
  assemblyaiBaseUrl?: string;
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
  useDockerWorkers?: boolean;
  useDockerWorkersEffective?: boolean;
  dockerWorkersOverriddenByEnv?: boolean;
};

type LlmProfileUi = LlmProfileApi & {
  apiKeyDraft: string;
  keyTouched: boolean;
};

const JUMP_LINKS: { id: string; label: string }[] = [
  { id: "settings-instance", label: "Instance" },
  { id: "settings-planning", label: "Planning & audio" },
  { id: "settings-publishing", label: "Publishing" },
  { id: "settings-connections", label: "Cloud & paths" },
  { id: "settings-notifications", label: "Notifications" },
];

/** Shown when a key exists server-side but the user has not started editing (not the real secret). */
const MASKED_API_KEY = "••••••••••••";

/** OpenAI-compatible `/v1` roots for quick setup (models list uses `GET …/v1/models`). */
const OAI_ENDPOINT_PRESETS: { id: string; label: string; baseUrl: string }[] = [
  { id: "openai", label: "OpenAI", baseUrl: "" },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "together", label: "Together AI", baseUrl: "https://api.together.xyz/v1" },
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
  { id: "mistral", label: "Mistral", baseUrl: "https://api.mistral.ai/v1" },
  { id: "xai", label: "xAI (Grok)", baseUrl: "https://api.x.ai/v1" },
  { id: "fireworks", label: "Fireworks AI", baseUrl: "https://api.fireworks.ai/inference/v1" },
  {
    id: "perplexity",
    label: "Perplexity (OpenAI-compatible)",
    baseUrl: "https://api.perplexity.ai",
  },
  { id: "ollama", label: "Ollama (local)", baseUrl: "http://127.0.0.1:11434/v1" },
  { id: "lmstudio", label: "LM Studio (local)", baseUrl: "http://127.0.0.1:1234/v1" },
  { id: "custom_oai", label: "Custom base URL…", baseUrl: "" },
];

const ANTHROPIC_ENDPOINT_PRESETS: { id: string; label: string; baseUrl: string }[] = [
  { id: "anthropic", label: "Anthropic", baseUrl: "" },
  { id: "minimax", label: "MiniMax (Anthropic-compatible)", baseUrl: "https://api.minimax.io/anthropic" },
  { id: "custom_anthropic", label: "Custom base URL…", baseUrl: "" },
];

function normBaseUrl(u: string) {
  return u.trim().replace(/\/+$/, "");
}

function openAiPresetIdForBase(baseUrl: string) {
  const n = normBaseUrl(baseUrl);
  if (!n) return "openai";
  const hit = OAI_ENDPOINT_PRESETS.find(
    (p) => p.id !== "custom_oai" && p.baseUrl && normBaseUrl(p.baseUrl) === n,
  );
  return hit?.id ?? "custom_oai";
}

function anthropicPresetIdForBase(baseUrl: string) {
  const n = normBaseUrl(baseUrl);
  if (!n) return "anthropic";
  const hit = ANTHROPIC_ENDPOINT_PRESETS.find(
    (p) => p.id !== "custom_anthropic" && p.baseUrl && normBaseUrl(p.baseUrl) === n,
  );
  return hit?.id ?? "custom_anthropic";
}

/** Mirrors server ``derive_llm_profile_label`` for display before save (label may be empty). */
function llmProfileDisplayName(p: {
  label: string;
  provider: "openai" | "anthropic";
  baseUrl: string;
  model: string;
}): string {
  const t = p.label.trim();
  if (t) return t;
  const m = p.model.trim() || "…";
  if (p.provider === "anthropic") {
    const bu = normBaseUrl(p.baseUrl).toLowerCase();
    if (bu.includes("minimax")) return `MiniMax · ${m}`;
    return `Anthropic · ${m}`;
  }
  const bu = normBaseUrl(p.baseUrl).toLowerCase();
  const presets: [string, string][] = [
    ["openrouter.ai", "OpenRouter"],
    ["api.groq.com", "Groq"],
    ["together.xyz", "Together"],
    ["deepseek.com", "DeepSeek"],
    ["mistral.ai", "Mistral"],
    ["x.ai", "xAI"],
    ["fireworks.ai", "Fireworks"],
    ["perplexity.ai", "Perplexity"],
    ["127.0.0.1:11434", "Ollama"],
    ["localhost:11434", "Ollama"],
    ["127.0.0.1:1234", "LM Studio"],
    ["localhost:1234", "LM Studio"],
    ["api.openai.com", "OpenAI"],
  ];
  for (const [needle, name] of presets) {
    if (bu.includes(needle)) return `${name} · ${m}`;
  }
  return `OpenAI · ${m}`;
}

function scrollToId(hash: string) {
  const el = document.getElementById(hash.replace(/^#/, ""));
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

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

function SectionHeader({
  title,
  description,
  className,
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl space-y-2", className)}>
      <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground md:text-2xl">
        {title}
      </h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

export function SettingsForm() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [openaiKeyConfigured, setOpenaiKeyConfigured] = useState(false);
  const [assemblyaiKeyConfigured, setAssemblyaiKeyConfigured] = useState(false);
  const [assemblyaiApiKeyDraft, setAssemblyaiApiKeyDraft] = useState("");
  const [assemblyaiKeyTouched, setAssemblyaiKeyTouched] = useState(false);
  const [assemblyaiBaseUrl, setAssemblyaiBaseUrl] = useState("");
  const [transcriptionBackend, setTranscriptionBackend] = useState<
    "local" | "openai_api" | "assemblyai"
  >("local");
  const [llmProfiles, setLlmProfiles] = useState<LlmProfileUi[]>([]);
  const [llmPrimaryId, setLlmPrimaryId] = useState("");
  const [llmFallbackIds, setLlmFallbackIds] = useState<string[]>([]);
  const [workspacePath, setWorkspacePath] = useState("");
  const [dataPath, setDataPath] = useState("");
  const [useDockerWorkers, setUseDockerWorkers] = useState(false);
  const [dockerWorkersOverriddenByEnv, setDockerWorkersOverriddenByEnv] =
    useState(false);

  const [longformMinS, setLongformMinS] = useState(180);
  const [longformMaxS, setLongformMaxS] = useState(360);
  const [shortformMinS, setShortformMinS] = useState(27);
  const [shortformMaxS, setShortformMaxS] = useState(80);
  const [snapDurationSlackS, setSnapDurationSlackS] = useState(3);
  const [maxUploadGiB, setMaxUploadGiB] = useState(5);

  const [llmModelOptionsById, setLlmModelOptionsById] = useState<Record<string, string[]>>(
    {},
  );
  const [llmModelListLoadingId, setLlmModelListLoadingId] = useState<string | null>(null);
  const [llmModelListError, setLlmModelListError] = useState<{
    profileId: string;
    message: string;
  } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await jsonFetch<SettingsResponse>(publicApiUrl("/api/settings"));
      setTranscriptionBackend(
        d.transcriptionBackend === "openai_api"
          ? "openai_api"
          : d.transcriptionBackend === "assemblyai"
            ? "assemblyai"
            : "local",
      );
      setAssemblyaiKeyConfigured(d.assemblyaiKeyConfigured ?? false);
      setAssemblyaiBaseUrl(d.assemblyaiBaseUrl ?? "");
      setAssemblyaiApiKeyDraft("");
      setAssemblyaiKeyTouched(false);
      const profs = d.llmProfiles;
      if (profs && profs.length > 0) {
        setLlmProfiles(
          profs.map((p) => ({
            ...p,
            apiKeyDraft: "",
            keyTouched: false,
          })),
        );
        setLlmPrimaryId(d.llmPrimaryId || profs[0]?.id || "");
        setLlmFallbackIds(d.llmFallbackIds ?? []);
      } else {
        const id = crypto.randomUUID();
        setLlmProfiles([
          {
            id,
            label: "",
            provider: "openai",
            baseUrl: d.openaiBaseUrl || "",
            model: d.openaiModel || "gpt-4o-mini",
            keyConfigured: d.openaiKeyConfigured,
            apiKeyDraft: "",
            keyTouched: false,
          },
        ]);
        setLlmPrimaryId(id);
        setLlmFallbackIds([]);
      }
      setWorkspacePath(d.workspacePath);
      setDataPath(d.dataPath);
      setUseDockerWorkers(d.useDockerWorkers ?? false);
      setDockerWorkersOverriddenByEnv(d.dockerWorkersOverriddenByEnv ?? false);
      setOpenaiKeyConfigured(d.openaiKeyConfigured);
      setLongformMinS(d.longformMinS ?? 180);
      setLongformMaxS(d.longformMaxS ?? 360);
      setShortformMinS(d.shortformMinS ?? 27);
      setShortformMaxS(d.shortformMaxS ?? 80);
      setSnapDurationSlackS(d.snapDurationSlackS ?? 3);
      setMaxUploadGiB(
        d.maxUploadBytes != null ? d.maxUploadBytes / 1024 ** 3 : 5,
      );
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveDockerWorkersSettings() {
    setError(null);
    setSaved(null);
    setPending(true);
    try {
      await jsonFetch(publicApiUrl("/api/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ use_docker_workers: useDockerWorkers }),
      });
      setSaved(
        "Pipeline worker preference saved. It applies the next time a pipeline starts.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  async function saveTranscriptionSettings() {
    setError(null);
    setSaved(null);
    setPending(true);
    try {
      const body: Record<string, unknown> = {
        transcription_backend: transcriptionBackend,
      };
      if (assemblyaiKeyTouched && assemblyaiApiKeyDraft.trim()) {
        body.assemblyai_api_key = assemblyaiApiKeyDraft.trim();
      }
      if (transcriptionBackend === "assemblyai") {
        body.assemblyai_base_url = assemblyaiBaseUrl.trim();
      }
      await jsonFetch(publicApiUrl("/api/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
      const llm_profiles = llmProfiles.map((p) => {
        const row: Record<string, unknown> = {
          id: p.id,
          provider: p.provider,
          base_url: p.baseUrl.trim() || null,
          model: p.model.trim() || null,
        };
        if (p.apiKeyDraft.trim()) {
          row.api_key = p.apiKeyDraft.trim();
        }
        return row;
      });
      const body: Record<string, unknown> = {
        llm_profiles,
        llm_primary_id: llmPrimaryId,
        llm_fallback_ids: llmFallbackIds,
      };

      await jsonFetch(publicApiUrl("/api/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setLlmProfiles((prev) =>
        prev.map((p) => ({ ...p, apiKeyDraft: "", keyTouched: false })),
      );
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

  async function refreshLlmModels(profileId: string) {
    const p = llmProfiles.find((x) => x.id === profileId);
    if (!p) return;
    setLlmModelListError((prev) => (prev?.profileId === profileId ? null : prev));
    setLlmModelListLoadingId(profileId);
    try {
      const body: Record<string, unknown> = {
        provider: p.provider,
        profile_id: profileId,
        base_url: p.baseUrl.trim() || null,
      };
      if (p.keyTouched && p.apiKeyDraft.trim()) {
        body.api_key = p.apiKeyDraft.trim();
      }
      const res = await jsonFetch<{ models: string[] }>(
        publicApiUrl("/api/settings/llm-list-models"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      setLlmModelListError((prev) => (prev?.profileId === profileId ? null : prev));
      setLlmModelOptionsById((prev) => ({ ...prev, [profileId]: res.models }));
    } catch (e) {
      setLlmModelListError({
        profileId,
        message:
          e instanceof Error ? e.message : "Could not load models from provider",
      });
    } finally {
      setLlmModelListLoadingId(null);
    }
  }

  async function clearProfileKey(profileId: string) {
    setError(null);
    setSaved(null);
    setPending(true);
    try {
      await jsonFetch(publicApiUrl("/api/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear_llm_profile_keys: [profileId] }),
      });
      setSaved("Stored key removed.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear");
    } finally {
      setPending(false);
    }
  }

  async function clearAssemblyaiApiKey() {
    setError(null);
    setSaved(null);
    setPending(true);
    try {
      await jsonFetch(publicApiUrl("/api/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear_assemblyai_api_key: true }),
      });
      setSaved("AssemblyAI key removed.");
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
    <div className="space-y-8">
      {/* Sticky section navigator */}
      <div
        className={cn(
          "sticky z-20 -mx-4 lg:-mx-0",
          "top-14 lg:top-0",
        )}
      >
        <div className="rounded-lg border border-border/50 bg-card/80 px-2.5 py-1.5 shadow-sm backdrop-blur-md sm:px-3 sm:py-2">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2.5">
            <p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Sections
            </p>
            <nav
              className="min-w-0 flex-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Jump to settings section"
            >
              <ul className="flex w-max flex-nowrap gap-1.5 pb-0.5 sm:w-full sm:flex-wrap sm:pb-0">
                {JUMP_LINKS.map((item) => (
                  <li key={item.id} className="shrink-0">
                    <a
                      href={`#${item.id}`}
                      className="inline-flex max-w-full items-center rounded-full border border-border/80 bg-background/90 px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-primary/35 hover:bg-accent hover:text-accent-foreground"
                      onClick={(e) => {
                        e.preventDefault();
                        scrollToId(item.id);
                      }}
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {saved ? (
        <div
          className="flex items-start justify-between gap-3 rounded-lg border border-primary/30 bg-primary/8 px-4 py-3 text-sm text-foreground shadow-sm"
          role="status"
        >
          <p className="min-w-0 leading-relaxed">{saved}</p>
          <button
            type="button"
            onClick={() => setSaved(null)}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      <div className="space-y-16 md:space-y-20">
        <section
          id="settings-instance"
          className="scroll-mt-36 space-y-5 md:scroll-mt-28 lg:scroll-mt-24"
        >
          <SectionHeader
            title="Instance"
            description="Paths come from the server environment. Jobs and uploads use the workspace; settings live in SQLite under data."
          />
          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle>Paths (read-only)</CardTitle>
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

          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle>Ephemeral pipeline workers</CardTitle>
              <CardDescription>
                When enabled, ingest, plan, and render run in a short-lived{" "}
                <strong>clipengine-worker</strong> container per pipeline start (not in the API
                process). Requires Docker on the host, the worker image built, and the API
                container must mount <span className="font-mono text-xs">/var/run/docker.sock</span>{" "}
                and include the <span className="font-mono text-xs">docker</span> CLI. Live capture
                still runs inside the API.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {dockerWorkersOverriddenByEnv ? (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
                  <strong>CLIPENGINE_USE_DOCKER_WORKERS</strong> is set in the environment and
                  overrides this toggle until it is unset.
                </p>
              ) : null}
              <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 rounded border-input"
                  checked={useDockerWorkers}
                  disabled={pending || dockerWorkersOverriddenByEnv}
                  onChange={(e) => setUseDockerWorkers(e.target.checked)}
                />
                <span>
                  Run the heavy pipeline in ephemeral Docker worker containers (stored in SQLite
                  on this instance).
                </span>
              </label>
              <Button
                type="button"
                disabled={pending || dockerWorkersOverriddenByEnv}
                onClick={() => void saveDockerWorkersSettings()}
              >
                {pending ? "Saving…" : "Save worker preference"}
              </Button>
            </CardContent>
          </Card>
        </section>

        <section
          id="settings-planning"
          className="scroll-mt-36 space-y-8 md:scroll-mt-28 lg:scroll-mt-24"
        >
          <SectionHeader
            title="Planning & audio"
            description="Configure how speech becomes a transcript, how the LLM proposes cuts, clip length defaults, and web search during planning."
          />

          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle>LLM</CardTitle>
              <CardDescription>
                Choose your backend for <strong>plan</strong>. API keys are stored in SQLite on
                this machine—treat the host as trusted. Use an endpoint preset (OpenRouter, Groq,
                Together, …) to fill the base URL, then <strong>Refresh models</strong> to load
                model ids from the provider.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-sm text-muted-foreground">
                Add one or more providers. Exactly one profile is <strong>primary</strong> for
                planning; optional <strong>fallbacks</strong> run in order if the previous call
                fails with a recoverable error (rate limits, timeouts, etc.).
              </p>

              <div className="space-y-4">
                {llmProfiles.map((p) => (
                  <div
                    key={p.id}
                    className="space-y-3 rounded-lg border border-border p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="llm-primary"
                          checked={llmPrimaryId === p.id}
                          onChange={() => {
                            setLlmPrimaryId(p.id);
                            setLlmFallbackIds((prev) => prev.filter((x) => x !== p.id));
                          }}
                        />
                        Primary
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={pending || llmProfiles.length <= 1}
                        onClick={() => {
                          setLlmProfiles((prev) => prev.filter((x) => x.id !== p.id));
                          setLlmFallbackIds((f) => f.filter((x) => x !== p.id));
                          if (llmPrimaryId === p.id) {
                            const rest = llmProfiles.filter((x) => x.id !== p.id);
                            if (rest[0]) setLlmPrimaryId(rest[0].id);
                          }
                        }}
                      >
                        Remove profile
                      </Button>
                    </div>
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="text-muted-foreground">Provider</span>
                      <select
                        className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={p.provider}
                        onChange={(e) => {
                          const v = e.target.value as "openai" | "anthropic";
                          setLlmProfiles((prev) =>
                            prev.map((x) => (x.id === p.id ? { ...x, provider: v } : x)),
                          );
                        }}
                      >
                        <option value="openai">OpenAI-compatible</option>
                        <option value="anthropic">Anthropic Messages</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="text-muted-foreground">Endpoint preset</span>
                      <select
                        className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={
                          p.provider === "openai"
                            ? openAiPresetIdForBase(p.baseUrl)
                            : anthropicPresetIdForBase(p.baseUrl)
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          if (p.provider === "openai") {
                            const preset = OAI_ENDPOINT_PRESETS.find((x) => x.id === v);
                            if (!preset || preset.id === "custom_oai") return;
                            setLlmProfiles((prev) =>
                              prev.map((x) =>
                                x.id === p.id
                                  ? {
                                      ...x,
                                      baseUrl: preset.baseUrl,
                                    }
                                  : x,
                              ),
                            );
                          } else {
                            const preset = ANTHROPIC_ENDPOINT_PRESETS.find((x) => x.id === v);
                            if (!preset || preset.id === "custom_anthropic") return;
                            setLlmProfiles((prev) =>
                              prev.map((x) =>
                                x.id === p.id
                                  ? {
                                      ...x,
                                      baseUrl: preset.baseUrl,
                                    }
                                  : x,
                              ),
                            );
                          }
                        }}
                      >
                        {(p.provider === "openai"
                          ? OAI_ENDPOINT_PRESETS
                          : ANTHROPIC_ENDPOINT_PRESETS
                        ).map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-muted-foreground">
                        {p.provider === "openai"
                          ? "Popular OpenAI-compatible hosts. Edit base URL below for anything else."
                          : "Anthropic API or a compatible gateway (e.g. MiniMax)."}
                      </span>
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Key status: {p.keyConfigured ? "configured" : "not set"}
                    </p>
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="text-muted-foreground">Base URL (optional)</span>
                      <input
                        className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={p.baseUrl}
                        onChange={(e) =>
                          setLlmProfiles((prev) =>
                            prev.map((x) =>
                              x.id === p.id ? { ...x, baseUrl: e.target.value } : x,
                            ),
                          )
                        }
                        placeholder={
                          p.provider === "openai"
                            ? "https://api.openai.com/v1"
                            : "default Anthropic endpoint"
                        }
                      />
                    </label>
                    <div className="space-y-1.5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
                          <span className="text-muted-foreground">Model</span>
                          <input
                            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            list={`llm-model-list-${p.id}`}
                            value={p.model}
                            onChange={(e) =>
                              setLlmProfiles((prev) =>
                                prev.map((x) =>
                                  x.id === p.id ? { ...x, model: e.target.value } : x,
                                ),
                              )
                            }
                            placeholder={
                              p.provider === "openai"
                                ? "gpt-4o-mini"
                                : "claude-3-5-sonnet-20241022"
                            }
                          />
                          <datalist id={`llm-model-list-${p.id}`}>
                            {(llmModelOptionsById[p.id] ?? []).map((m) => (
                              <option key={m} value={m} />
                            ))}
                          </datalist>
                        </label>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="shrink-0 sm:mb-0"
                          disabled={pending || llmModelListLoadingId === p.id}
                          onClick={() => void refreshLlmModels(p.id)}
                        >
                          {llmModelListLoadingId === p.id ? (
                            <>
                              <Loader2
                                className="mr-2 size-4 animate-spin"
                                aria-hidden
                              />
                              Loading…
                            </>
                          ) : (
                            "Refresh models"
                          )}
                        </Button>
                      </div>
                      {llmModelListError?.profileId === p.id ? (
                        <p className="text-xs text-destructive">{llmModelListError.message}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {llmModelOptionsById[p.id]?.length
                            ? `${llmModelOptionsById[p.id]!.length} models loaded — pick one or type a custom id.`
                            : "Uses the saved API key (or the key you typed above)."}
                        </p>
                      )}
                    </div>
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="text-muted-foreground">
                        API key (leave blank to keep existing)
                      </span>
                      <input
                        type="password"
                        autoComplete="off"
                        className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={
                          p.keyConfigured && !p.keyTouched ? MASKED_API_KEY : p.apiKeyDraft
                        }
                        onFocus={() =>
                          setLlmProfiles((prev) =>
                            prev.map((x) =>
                              x.id === p.id ? { ...x, keyTouched: true } : x,
                            ),
                          )
                        }
                        onBlur={() => {
                          if (p.apiKeyDraft === "" && p.keyConfigured) {
                            setLlmProfiles((prev) =>
                              prev.map((x) =>
                                x.id === p.id ? { ...x, keyTouched: false } : x,
                              ),
                            );
                          }
                        }}
                        onChange={(e) =>
                          setLlmProfiles((prev) =>
                            prev.map((x) =>
                              x.id === p.id ? { ...x, apiKeyDraft: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    {p.keyConfigured ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => void clearProfileKey(p.id)}
                      >
                        Remove stored key
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="space-y-2 rounded-lg border border-dashed border-border p-4">
                <p className="text-sm font-medium">Fallback order (optional)</p>
                <p className="text-xs text-muted-foreground">
                  Non-primary profiles can be tried after the primary on recoverable failures.
                </p>
                {llmFallbackIds.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No fallbacks configured.</p>
                ) : (
                  <ul className="space-y-2">
                    {llmFallbackIds.map((fid, idx) => {
                      const prof = llmProfiles.find((x) => x.id === fid);
                      const name = prof
                        ? llmProfileDisplayName(prof)
                        : `${fid.slice(0, 8)}…`;
                      return (
                        <li
                          key={fid}
                          className="flex flex-wrap items-center gap-2 text-sm"
                        >
                          <span className="text-muted-foreground">{idx + 1}.</span>
                          <span>{name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={pending || idx === 0}
                            onClick={() =>
                              setLlmFallbackIds((prev) => {
                                const n = [...prev];
                                [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]];
                                return n;
                              })
                            }
                          >
                            Up
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={pending || idx >= llmFallbackIds.length - 1}
                            onClick={() =>
                              setLlmFallbackIds((prev) => {
                                const n = [...prev];
                                [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]];
                                return n;
                              })
                            }
                          >
                            Down
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            disabled={pending}
                            onClick={() =>
                              setLlmFallbackIds((prev) => prev.filter((x) => x !== fid))
                            }
                          >
                            Remove
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Add fallback</span>
                  <select
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      setLlmFallbackIds((prev) => [...prev, v]);
                      e.target.value = "";
                    }}
                  >
                    <option value="">Choose profile…</option>
                    {llmProfiles
                      .filter(
                        (x) => x.id !== llmPrimaryId && !llmFallbackIds.includes(x.id),
                      )
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {llmProfileDisplayName(x)}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    const id = crypto.randomUUID();
                    setLlmProfiles((prev) => [
                      ...prev,
                      {
                        id,
                        label: "",
                        provider: "openai",
                        baseUrl: "",
                        model: "gpt-4o-mini",
                        keyConfigured: false,
                        apiKeyDraft: "",
                        keyTouched: false,
                      },
                    ]);
                  }}
                >
                  Add profile
                </Button>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => void saveLlmSettings()}
                >
                  {pending ? "Saving…" : "Save LLM settings"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle>Transcription (ingest)</CardTitle>
              <CardDescription>
                Choose how speech is turned into <code className="text-xs">transcript.json</code>{" "}
                during <strong>ingest</strong>. OpenAI mode uses the{" "}
                <strong>first OpenAI-compatible profile in your LLM chain that has an API key</strong>{" "}
                (see{" "}
                <a
                  className="text-primary underline-offset-4 hover:underline"
                  href="https://platform.openai.com/docs/guides/speech-to-text"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  OpenAI speech-to-text
                </a>
                ). AssemblyAI runs on AssemblyAI&apos;s API (create a key in their dashboard).
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
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="transcription"
                    checked={transcriptionBackend === "assemblyai"}
                    onChange={() => setTranscriptionBackend("assemblyai")}
                  />
                  AssemblyAI
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
              ) : transcriptionBackend === "assemblyai" ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Cloud transcription via{" "}
                    <a
                      className="text-primary underline-offset-4 hover:underline"
                      href="https://www.assemblyai.com/docs"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      AssemblyAI
                    </a>
                    . Paste your API key below (from the AssemblyAI dashboard). Optional: set the API
                    base URL for EU data residency (
                    <code className="text-[0.7rem]">https://api.eu.assemblyai.com</code>
                    ).
                  </p>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted-foreground">
                      AssemblyAI API key (leave blank to keep existing)
                    </span>
                    <input
                      type="password"
                      autoComplete="off"
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={
                        assemblyaiKeyConfigured && !assemblyaiKeyTouched
                          ? MASKED_API_KEY
                          : assemblyaiApiKeyDraft
                      }
                      onFocus={() => setAssemblyaiKeyTouched(true)}
                      onBlur={() => {
                        if (assemblyaiApiKeyDraft === "" && assemblyaiKeyConfigured) {
                          setAssemblyaiKeyTouched(false);
                        }
                      }}
                      onChange={(e) => setAssemblyaiApiKeyDraft(e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted-foreground">API base URL (optional)</span>
                    <input
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={assemblyaiBaseUrl}
                      onChange={(e) => setAssemblyaiBaseUrl(e.target.value)}
                      placeholder="https://api.assemblyai.com"
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Key status:{" "}
                    {assemblyaiKeyConfigured ? (
                      <span className="text-foreground">configured</span>
                    ) : (
                      <span className="text-destructive">not set</span>
                    )}
                  </p>
                  {assemblyaiKeyConfigured ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => void clearAssemblyaiApiKey()}
                    >
                      Remove stored AssemblyAI key
                    </Button>
                  ) : null}
                </div>
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

          <Card className="border-border/80 shadow-sm">
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
                <span className="text-muted-foreground">Snap duration slack (seconds)</span>
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

          <SearchSettingsCard
            onSaved={async () => {
              setSaved("Search settings saved. They apply to the next pipeline run.");
              await load();
            }}
          />
        </section>

        <section
          id="settings-publishing"
          className="scroll-mt-36 space-y-5 md:scroll-mt-28 lg:scroll-mt-24"
        >
          <SectionHeader
            title="Publishing"
            description="Defaults for how finished clips are titled, described, or tagged when you send them to social platforms."
          />
          <PublishingSettingsCard />
        </section>

        <section
          id="settings-connections"
          className="scroll-mt-36 space-y-8 md:scroll-mt-28 lg:scroll-mt-24"
        >
          <SectionHeader
            title="Cloud & paths"
            description="Connect Google Drive, YouTube, S3, SMB, and local bind paths for importing media and exporting renders. Each integration saves on its own card."
          />
          <div className="grid gap-6 lg:grid-cols-1">
            <GoogleDriveSettingsCard />
            <YouTubeSettingsCard />
            <S3SettingsCard />
            <SmbSettingsCard />
            <LocalBindSettingsCard />
          </div>
        </section>

        <section
          id="settings-notifications"
          className="scroll-mt-36 space-y-5 md:scroll-mt-28 lg:scroll-mt-24"
        >
          <SectionHeader
            title="Notifications"
            description="Optional Telegram bot for run status messages."
          />
          <TelegramNotificationsCard />
        </section>
      </div>
    </div>
  );
}
