"use client";

import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Brain,
  Cloud,
  FolderOpen,
  FolderTree,
  GitBranch,
  Mic,
  Network,
  Package,
  Search,
  Send,
  Video,
} from "lucide-react";

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

type LlmProfileUi = LlmProfileApi & {
  apiKeyDraft: string;
  keyTouched: boolean;
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

const STORAGE_CHILDREN: {
  id: SettingsSectionId;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "storage-google-drive", label: "Google Drive", icon: Cloud },
  { id: "storage-youtube", label: "YouTube", icon: Video },
  { id: "storage-s3", label: "S3", icon: Package },
  { id: "storage-smb", label: "SMB", icon: Network },
  { id: "storage-local-bind", label: "Local path", icon: FolderOpen },
];

function SettingsNavButton({
  icon: Icon,
  label,
  active,
  onClick,
  nested,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  nested?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md text-left text-sm transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        nested ? "px-2 py-1.5" : "px-2.5 py-2",
        active
          ? "bg-primary/12 font-medium text-primary ring-1 ring-inset ring-primary/25"
          : "text-foreground/80 hover:bg-muted/70 hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "shrink-0",
          nested ? "size-3.5" : "size-4",
          active ? "text-primary" : "text-muted-foreground",
        )}
        aria-hidden
      />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

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
  const [llmProfiles, setLlmProfiles] = useState<LlmProfileUi[]>([]);
  const [llmPrimaryId, setLlmPrimaryId] = useState("");
  const [llmFallbackIds, setLlmFallbackIds] = useState<string[]>([]);
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
            label: "OpenAI",
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
      const llm_profiles = llmProfiles.map((p) => {
        const row: Record<string, unknown> = {
          id: p.id,
          label: p.label.trim() || null,
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

  if (!loaded && !error) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-10">
      {/* Section nav: stacked on top on small screens, fixed-width column from md up */}
      <aside className="w-full shrink-0 md:w-60">
        <nav
          className="sticky top-4 rounded-xl border border-border/80 bg-muted/30 p-3 shadow-sm backdrop-blur-[2px]"
          aria-label="Settings sections"
        >
          <div className="flex flex-col gap-0.5">
            <p className="px-1 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Environment
            </p>

            <SettingsNavButton
              icon={FolderTree}
              label="Path"
              active={section === "path"}
              onClick={() => setSection("path")}
            />

            <div className="mt-1 rounded-lg bg-background/40 py-1.5">
              <p className="px-2.5 pb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Storage
              </p>
              <div className="ml-1.5 flex flex-col gap-0.5 border-l border-border/70 pl-2">
                {STORAGE_CHILDREN.map((s) => (
                  <SettingsNavButton
                    key={s.id}
                    icon={s.icon}
                    label={s.label}
                    nested
                    active={section === s.id}
                    onClick={() => setSection(s.id)}
                  />
                ))}
              </div>
            </div>

            <div
              className="my-3 h-px bg-gradient-to-r from-transparent via-border to-transparent"
              role="separator"
            />

            <p className="px-1 pb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Processing
            </p>

            <SettingsNavButton
              icon={Brain}
              label="LLM"
              active={section === "llm"}
              onClick={() => setSection("llm")}
            />
            <SettingsNavButton
              icon={Mic}
              label="Transcription"
              active={section === "transcription"}
              onClick={() => setSection("transcription")}
            />
            <SettingsNavButton
              icon={GitBranch}
              label="Pipeline"
              active={section === "pipeline"}
              onClick={() => setSection("pipeline")}
            />
            <SettingsNavButton
              icon={Send}
              label="Publishing"
              active={section === "publishing"}
              onClick={() => setSection("publishing")}
            />
            <SettingsNavButton
              icon={Search}
              label="Search"
              active={section === "search"}
              onClick={() => setSection("search")}
            />
            <SettingsNavButton
              icon={Bell}
              label="Notifications"
              active={section === "notifications"}
              onClick={() => setSection("notifications")}
            />
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
                        <span className="text-muted-foreground">Label (optional)</span>
                        <input
                          className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={p.label}
                          onChange={(e) =>
                            setLlmProfiles((prev) =>
                              prev.map((x) =>
                                x.id === p.id ? { ...x, label: e.target.value } : x,
                              ),
                            )
                          }
                          placeholder={p.provider === "openai" ? "OpenAI" : "Anthropic"}
                        />
                      </label>
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
                      <label className="flex flex-col gap-1.5 text-sm">
                        <span className="text-muted-foreground">Model</span>
                        <input
                          className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

                <div className="flex flex-wrap gap-2">
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
                          label: "OpenAI",
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
                    Add OpenAI-compatible profile
                  </Button>
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
                          label: "Anthropic",
                          provider: "anthropic",
                          baseUrl: "",
                          model: "claude-3-5-sonnet-20241022",
                          keyConfigured: false,
                          apiKeyDraft: "",
                          keyTouched: false,
                        },
                      ]);
                    }}
                  >
                    Add Anthropic profile
                  </Button>
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
                        const name =
                          prof?.label?.trim() ||
                          `${prof?.provider ?? "?"} (${fid.slice(0, 8)}…)`;
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
                            {x.label.trim() || `${x.provider} (${x.id.slice(0, 8)}…)`}
                          </option>
                        ))}
                    </select>
                  </label>
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
                during <strong>ingest</strong>. OpenAI mode uses the <strong>first OpenAI-compatible
                profile in your LLM chain that has an API key</strong> (see{" "}
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
