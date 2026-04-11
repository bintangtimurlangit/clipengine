"use client";

import {
  ArrowLeft,
  Braces,
  Check,
  CircleStop,
  Copy,
  File,
  FileAudio,
  FileVideo,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  ScrollText,
  Sparkles,
  Subtitles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { publicApiUrl, publicWsUrl } from "@/lib/api";
import {
  artifactDownloadUrl,
  isVideoArtifactPath,
  llmActivityUrl,
  planActivityUrl,
  renderActivityUrl,
  renderedClipZipUrl,
} from "@/lib/runs-api";
import { computePipelineOverview } from "@/lib/pipeline-visual";
import { cn } from "@/lib/utils";
import type { ArtifactRow, ClipItem, PipelineRun } from "@/types/run";

import { ArtifactVideoPreviewDialog } from "@/components/library/artifact-video-preview-dialog";
import { PipelineTracker, pipelineProgressAriaLabel } from "@/components/runs/pipeline-tracker";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { ConfirmAlertDialog } from "@/components/ui/confirm-alert-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

type Props = { runId: string; initialRun: PipelineRun };

type GDriveStatus = { hasCredentials: boolean; connected: boolean };

type YouTubeAccountRow = {
  id: string;
  connected: boolean;
  channelId?: string | null;
  channelTitle?: string | null;
};

type YouTubeRunStatus = {
  hasCredentials: boolean;
  connected: boolean;
  accounts?: YouTubeAccountRow[];
};

type S3RunStatus = { configured: boolean };

type SmbRunStatus = { configured: boolean };

type LlmStatus = { configured: boolean };

type OutputKind = "workspace" | "google_drive" | "youtube" | "s3" | "smb" | "local_bind";

type YouTubePrivacy = "private" | "unlisted" | "public";

type YoutubeDistribution =
  | "single"
  | "random"
  | "round_robin"
  | "random_run"
  | "broadcast";

/** Written by the API during ``plan``; polled to show where time is spent. */
type PlanActivityPayload = {
  phase: string;
  updatedAt: string;
  updatedAtMs: number;
  detail?: string;
  searchProvider?: string;
  error?: string;
};

function formatPlanActivityStale(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s ago`;
}

/** Written by the worker during ``render``; polled for clip N of M. */
type RenderActivityPayload = {
  phase: string;
  current: number;
  total: number;
  kind: string;
  title?: string;
  updatedAt?: string;
  updatedAtMs?: number;
};

function formatRenderActivityLine(p: RenderActivityPayload): string {
  if (p.phase === "render_start") {
    return p.title?.trim() || "Preparing FFmpeg…";
  }
  if (p.phase === "render_complete") {
    if (p.total === 0) return "No clips to encode.";
    return `Finished ${p.total} clip(s).`;
  }
  const label =
    p.kind === "longform" ? "long" : p.kind === "shortform" ? "short" : p.kind || "clip";
  const tail = p.title?.trim() ? ` · ${p.title.trim()}` : "";
  return `Encoding clip ${p.current} of ${p.total} (${label})${tail}`;
}

function RenderProgressBody({
  renderActivity,
  renderActivityErr,
  variant = "card",
}: {
  renderActivity: RenderActivityPayload | null;
  renderActivityErr: string | null;
  /** ``terminal``: same monospace console as the plan log (cyan tint). */
  variant?: "card" | "terminal";
}) {
  const isTerminal = variant === "terminal";
  const labelCls = isTerminal
    ? "font-mono text-xs font-medium tracking-tight text-cyan-400/95"
    : "font-mono text-xs font-medium tracking-tight text-cyan-300/90";
  const ratioCls = isTerminal
    ? "font-mono text-[11px] text-cyan-300/95 tabular-nums"
    : "font-mono text-[11px] text-cyan-400/90 tabular-nums";
  const lineCls = isTerminal
    ? "mt-1.5 font-mono text-[11px] leading-relaxed text-cyan-400/90"
    : "mt-1.5 font-mono text-[11px] leading-relaxed text-zinc-200";
  const idleCls = isTerminal
    ? "font-mono text-[11px] text-cyan-400/70"
    : "font-mono text-[11px] text-zinc-500";
  const barTrack = isTerminal ? "mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/90" : "mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800";

  return (
    <>
      {renderActivityErr ? (
        <p className="font-mono text-[11px] text-red-400/90">{renderActivityErr}</p>
      ) : null}
      {!renderActivity && !renderActivityErr ? (
        <p className={idleCls}>Starting FFmpeg…</p>
      ) : null}
      {renderActivity ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={labelCls}>Render</span>
            {renderActivity.total > 0 &&
            (renderActivity.phase === "render_clip" || renderActivity.phase === "render_start") ? (
              <span className={ratioCls}>
                {renderActivity.current}/{renderActivity.total}
              </span>
            ) : null}
          </div>
          <p className={lineCls}>{formatRenderActivityLine(renderActivity)}</p>
          {renderActivity.total > 0 &&
          (renderActivity.phase === "render_clip" || renderActivity.phase === "render_start") ? (
            <div
              className={barTrack}
              role="progressbar"
              aria-valuenow={renderActivity.current}
              aria-valuemin={1}
              aria-valuemax={renderActivity.total}
              aria-label={`Clip ${renderActivity.current} of ${renderActivity.total}`}
            >
              <div
                className="h-full rounded-full bg-cyan-500/80 transition-[width] duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((renderActivity.current / renderActivity.total) * 100),
                  )}%`,
                }}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function formatPlanActivityLine(p: PlanActivityPayload): string {
  switch (p.phase) {
    case "plan_start":
      return "Starting plan step…";
    case "foundation_llm":
      return "Foundation LLM (video context + search queries)";
    case "web_search":
      return `Web search · ${p.detail ?? "?"}${p.searchProvider ? ` (${p.searchProvider})` : ""}`;
    case "web_search_failed":
      return `Web search failed — ${p.error ?? "unknown"} (continuing without excerpts)`;
    case "cut_plan_llm":
      return "Cut plan LLM";
    case "plan_complete":
      return "Plan file written";
    default:
      return p.phase;
  }
}

/** Compact plan phase for the LLM card header. */
function formatPlanActivityShort(p: PlanActivityPayload): string {
  switch (p.phase) {
    case "plan_start":
      return "starting";
    case "foundation_llm":
      return "foundation LLM";
    case "web_search":
      return p.searchProvider ? `web search (${p.searchProvider})` : "web search";
    case "web_search_failed":
      return "web search (failed)";
    case "cut_plan_llm":
      return "cut plan LLM";
    case "plan_complete":
      return "writing plan";
    default:
      return p.phase;
  }
}

function llmTerminalHeaderSubtitle(
  step: string | null,
  planActivity: PlanActivityPayload | null,
  renderActivity: RenderActivityPayload | null,
): string {
  if (step === "plan") {
    if (planActivity?.phase) {
      return `plan · ${formatPlanActivityShort(planActivity)}`;
    }
    return "plan · live";
  }
  if (step === "render") {
    if (!renderActivity) {
      return "render · waiting…";
    }
    if (renderActivity.phase === "render_start") {
      return "render · preparing";
    }
    if (renderActivity.phase === "render_clip" && renderActivity.total > 0) {
      return `render · clip ${renderActivity.current}/${renderActivity.total}`;
    }
    if (renderActivity.phase === "render_complete") {
      return "render · finishing…";
    }
    return "render · encoding";
  }
  return "pipeline";
}

type AudioStreamRow = {
  index: number;
  codec: string;
  channels: number;
  language: string | null;
  title: string | null;
};

function formatAudioStreamLabel(s: AudioStreamRow): string {
  const bits: string[] = [s.codec];
  if (s.channels > 0) bits.push(`${s.channels} ch`);
  if (s.language) bits.push(s.language);
  if (s.title) bits.push(s.title);
  return bits.join(" · ") || `Stream ${s.index}`;
}

function publishedYoutubeVideos(
  run: PipelineRun,
): { path: string; watchUrl: string; channelTitle?: string }[] {
  const ex = run.extra;
  if (!ex || typeof ex !== "object") return [];
  const py = (ex as Record<string, unknown>).publishedYoutube;
  if (!py || typeof py !== "object") return [];
  const raw = (py as { videos?: unknown }).videos;
  if (!Array.isArray(raw)) return [];
  const out: { path: string; watchUrl: string; channelTitle?: string }[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const path = typeof o.path === "string" ? o.path : "";
    const watchUrl = typeof o.watchUrl === "string" ? o.watchUrl : "";
    const channelTitle =
      typeof o.channelTitle === "string" && o.channelTitle.trim()
        ? o.channelTitle
        : undefined;
    if (path && watchUrl) out.push({ path, watchUrl, channelTitle });
  }
  return out;
}

function isPipelineInProgress(run: PipelineRun): boolean {
  return (
    run.status === "pending" ||
    run.status === "fetching" ||
    run.status === "recording" ||
    run.status === "running"
  );
}

/** True when this run uses the LLM for planning (not heuristic-only). */
function runUsesLlmPlan(run: PipelineRun): boolean {
  const pm = run.extra && typeof run.extra === "object" && "planMode" in run.extra
    ? (run.extra as { planMode?: unknown }).planMode
    : undefined;
  return pm !== "heuristic";
}

function runTranscriptionLabel(run: PipelineRun): string {
  const ex = run.extra;
  if (ex && typeof ex === "object" && "transcriptionBackend" in ex) {
    const b = String((ex as Record<string, unknown>).transcriptionBackend);
    if (b === "openai_api") return "OpenAI API (whisper-1)";
    if (b === "assemblyai") return "AssemblyAI";
  }
  return `${run.whisperModel} (local)`;
}

function formatArtifactBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function groupArtifactsByDirectory(
  list: ArtifactRow[],
): { dir: string; entries: ArtifactRow[] }[] {
  const map = new Map<string, ArtifactRow[]>();
  for (const a of list) {
    const lastSlash = a.path.lastIndexOf("/");
    const dir = lastSlash === -1 ? "" : a.path.slice(0, lastSlash);
    if (!map.has(dir)) map.set(dir, []);
    map.get(dir)!.push(a);
  }
  const dirs = [...map.keys()].sort((a, b) => {
    if (a === "") return -1;
    if (b === "") return 1;
    return a.localeCompare(b);
  });
  return dirs.map((dir) => ({
    dir,
    entries: map.get(dir)!.slice().sort((x, y) => x.path.localeCompare(y.path)),
  }));
}

function clipTitleFromMp4Path(mp4Path: string): string {
  const seg = mp4Path.split("/").pop() ?? mp4Path;
  return seg.replace(/\.mp4$/i, "");
}

function ArtifactFileIcon({ path }: { path: string }) {
  const lower = path.toLowerCase();
  if (/\.(mp4|mkv|mov|webm|avi|m4v)$/i.test(lower)) {
    return <FileVideo className="h-4 w-4 shrink-0 text-sky-400/90" aria-hidden />;
  }
  if (/\.(jpg|jpeg|png|webp|gif)$/i.test(lower)) {
    return <ImageIcon className="h-4 w-4 shrink-0 text-violet-400/90" aria-hidden />;
  }
  if (lower.endsWith(".json")) {
    return <Braces className="h-4 w-4 shrink-0 text-amber-400/90" aria-hidden />;
  }
  if (/\.(wav|mp3|m4a|aac|flac)$/i.test(lower)) {
    return <FileAudio className="h-4 w-4 shrink-0 text-emerald-400/90" aria-hidden />;
  }
  if (/\.(vtt|srt)$/i.test(lower)) {
    return <Subtitles className="h-4 w-4 shrink-0 text-cyan-400/90" aria-hidden />;
  }
  if (lower.endsWith(".log")) {
    return <ScrollText className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />;
  }
  return <File className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
}

export function RunDetail({ runId, initialRun }: Props) {
  const router = useRouter();
  const [run, setRun] = useState(initialRun);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [artErr, setArtErr] = useState<string | null>(null);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [startingPipeline, setStartingPipeline] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  const [stopLiveErr, setStopLiveErr] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [restartDialogOpen, setRestartDialogOpen] = useState(false);
  const [restartErr, setRestartErr] = useState<string | null>(null);

  const [outputKind, setOutputKind] = useState<OutputKind>("workspace");
  const [gdriveFolderId, setGdriveFolderId] = useState("");
  const [gdriveStatus, setGdriveStatus] = useState<GDriveStatus | null>(null);
  const [youtubeStatus, setYoutubeStatus] = useState<YouTubeRunStatus | null>(null);
  const [youtubePrivacy, setYoutubePrivacy] = useState<YouTubePrivacy>("private");
  const [youtubeDistribution, setYoutubeDistribution] =
    useState<YoutubeDistribution>("single");
  const [youtubeAccountSelected, setYoutubeAccountSelected] = useState<Set<string>>(
    () => new Set(),
  );
  const [youtubeChannelFilter, setYoutubeChannelFilter] = useState("");
  const [s3Status, setS3Status] = useState<S3RunStatus | null>(null);
  const [smbStatus, setSmbStatus] = useState<SmbRunStatus | null>(null);
  const [s3Prefix, setS3Prefix] = useState("");
  const [smbSubpath, setSmbSubpath] = useState("");
  const [localBindPath, setLocalBindPath] = useState("");
  const [llmStatus, setLlmStatus] = useState<LlmStatus | null>(null);
  const [llmActivityText, setLlmActivityText] = useState<string | null>(null);
  const [planActivity, setPlanActivity] = useState<PlanActivityPayload | null>(null);
  const [planActivityErr, setPlanActivityErr] = useState<string | null>(null);
  const [renderActivity, setRenderActivity] = useState<RenderActivityPayload | null>(null);
  const [renderActivityErr, setRenderActivityErr] = useState<string | null>(null);
  const llmTerminalEndRef = useRef<HTMLDivElement>(null);
  /** Saved `llm_activity.log` for completed runs (Planning card terminal). */
  const [llmArchiveLogText, setLlmArchiveLogText] = useState<string | null>(null);
  const [llmArchiveLogErr, setLlmArchiveLogErr] = useState<string | null>(null);
  const llmArchiveLogEndRef = useRef<HTMLDivElement>(null);
  const [publishClips, setPublishClips] = useState<ClipItem[] | null>(null);
  const [publishClipsErr, setPublishClipsErr] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [audioStreams, setAudioStreams] = useState<AudioStreamRow[] | null>(null);
  const [audioStreamsErr, setAudioStreamsErr] = useState<string | null>(null);
  const [audioStreamIndex, setAudioStreamIndex] = useState(0);
  const [previewArtifact, setPreviewArtifact] = useState<{ path: string; title: string } | null>(
    null,
  );

  const poll = useCallback(async () => {
    try {
      const data = await jsonFetch<{ run: PipelineRun }>(
        publicApiUrl(`/api/runs/${runId}`),
      );
      setRun(data.run);
    } catch {
      /* ignore transient errors while polling */
    }
  }, [runId]);

  useEffect(() => {
    void poll();
    const t = window.setInterval(() => {
      void poll();
    }, 2000);
    return () => window.clearInterval(t);
  }, [poll]);

  useEffect(() => {
    void (async () => {
      try {
        const s = await jsonFetch<GDriveStatus>(publicApiUrl("/api/google-drive/status"));
        setGdriveStatus(s);
      } catch {
        setGdriveStatus(null);
      }
      try {
        const ys = await jsonFetch<YouTubeRunStatus>(publicApiUrl("/api/youtube/status"));
        setYoutubeStatus(ys);
      } catch {
        setYoutubeStatus(null);
      }
      try {
        const s3 = await jsonFetch<S3RunStatus>(publicApiUrl("/api/s3/status"));
        setS3Status(s3);
      } catch {
        setS3Status(null);
      }
      try {
        const sm = await jsonFetch<SmbRunStatus>(publicApiUrl("/api/smb/status"));
        setSmbStatus(sm);
      } catch {
        setSmbStatus(null);
      }
      try {
        const lm = await jsonFetch<LlmStatus>(publicApiUrl("/api/settings/llm-status"));
        setLlmStatus(lm);
      } catch {
        setLlmStatus({ configured: true });
      }
    })();
  }, []);

  const showGoogleDrive = gdriveStatus?.hasCredentials === true;
  const showYouTube = youtubeStatus?.hasCredentials === true;
  const showS3 = s3Status?.configured === true;
  const showSmb = smbStatus?.configured === true;

  const youtubeConnectedIds = useMemo(
    () =>
      (youtubeStatus?.accounts ?? [])
        .filter((a) => a.connected)
        .map((a) => a.id),
    [youtubeStatus?.accounts],
  );

  const youtubeAccountsFiltered = useMemo(() => {
    const list = youtubeStatus?.accounts ?? [];
    const q = youtubeChannelFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((a) => {
      const title = (a.channelTitle || "").toLowerCase();
      const id = a.id.toLowerCase();
      return title.includes(q) || id.includes(q);
    });
  }, [youtubeStatus?.accounts, youtubeChannelFilter]);

  useEffect(() => {
    if (outputKind === "google_drive" && gdriveStatus != null && !showGoogleDrive) {
      setOutputKind("workspace");
    }
    if (outputKind === "youtube" && youtubeStatus != null && !showYouTube) {
      setOutputKind("workspace");
    }
    if (outputKind === "s3" && s3Status != null && !showS3) {
      setOutputKind("workspace");
    }
    if (outputKind === "smb" && smbStatus != null && !showSmb) {
      setOutputKind("workspace");
    }
  }, [
    outputKind,
    gdriveStatus,
    youtubeStatus,
    s3Status,
    smbStatus,
    showGoogleDrive,
    showYouTube,
    showS3,
    showSmb,
  ]);

  useEffect(() => {
    if (run.status !== "ready") {
      setAudioStreams(null);
      setAudioStreamsErr(null);
      return;
    }
    let cancelled = false;
    setAudioStreams(null);
    setAudioStreamsErr(null);
    void (async () => {
      try {
        const data = await jsonFetch<{ streams: AudioStreamRow[] }>(
          publicApiUrl(`/api/runs/${runId}/audio-streams`),
        );
        if (!cancelled) {
          setAudioStreams(data.streams);
          setAudioStreamIndex((prev) => {
            const stillValid = data.streams.some((s) => s.index === prev);
            return stillValid ? prev : 0;
          });
          setAudioStreamsErr(null);
        }
      } catch (e) {
        if (!cancelled) {
          setAudioStreams([]);
          setAudioStreamsErr(
            e instanceof Error ? e.message : "Could not load audio streams",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, run.status]);

  const loadArtifacts = useCallback(async () => {
    setArtErr(null);
    try {
      const data = await jsonFetch<{ artifacts: ArtifactRow[] }>(
        publicApiUrl(`/api/runs/${runId}/artifacts`),
      );
      setArtifacts(data.artifacts);
    } catch (e) {
      setArtErr(e instanceof Error ? e.message : "Failed to list artifacts");
    }
  }, [runId]);

  useEffect(() => {
    void loadArtifacts();
    const t = window.setInterval(loadArtifacts, 4000);
    return () => window.clearInterval(t);
  }, [loadArtifacts]);

  useEffect(() => {
    const hasPlan = artifacts.some((a) => a.path === "cut_plan.json");
    if (run.status !== "completed" && !hasPlan) {
      setPublishClips(null);
      setPublishClipsErr(null);
      return;
    }
    let cancelled = false;
    setPublishClipsErr(null);
    void (async () => {
      try {
        const data = await jsonFetch<{ clips: ClipItem[] }>(
          publicApiUrl(`/api/runs/${runId}/clips`),
        );
        if (!cancelled) setPublishClips(data.clips);
      } catch (e) {
        if (!cancelled) {
          setPublishClips(null);
          setPublishClipsErr(e instanceof Error ? e.message : "Failed to load clips");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, run.status, artifacts]);

  /** Live during plan; keep showing the finished planning log while render runs (same file, read-only). */
  const showLlmTerminal =
    runUsesLlmPlan(run) &&
    isPipelineInProgress(run) &&
    run.status === "running" &&
    (run.step === "plan" || run.step === "render");

  const showRenderProgress =
    run.status === "running" &&
    run.step === "render" &&
    isPipelineInProgress(run);

  const liveWsUrl = useMemo(() => publicWsUrl(`/api/runs/${runId}/live`), [runId]);

  useEffect(() => {
    if (!showLlmTerminal) {
      setLlmActivityText(null);
      setPlanActivity(null);
      setPlanActivityErr(null);
      return;
    }
    if (liveWsUrl) {
      return;
    }
    let cancelled = false;
    const fetchLog = async () => {
      try {
        const res = await fetch(llmActivityUrl(runId), { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 404) {
          setLlmActivityText("");
          return;
        }
        if (!res.ok) {
          setLlmActivityText(`(could not load log: ${res.status})`);
          return;
        }
        setLlmActivityText(await res.text());
      } catch {
        if (!cancelled) setLlmActivityText("(network error loading LLM log)");
      }
    };
    const fetchPlanActivity = async () => {
      try {
        const res = await fetch(planActivityUrl(runId), { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 404) {
          setPlanActivity(null);
          setPlanActivityErr(null);
          return;
        }
        if (!res.ok) {
          setPlanActivityErr(`HTTP ${res.status}`);
          setPlanActivity(null);
          return;
        }
        const j = (await res.json()) as PlanActivityPayload;
        setPlanActivityErr(null);
        setPlanActivity(j);
      } catch {
        if (!cancelled) {
          setPlanActivityErr("network error");
          setPlanActivity(null);
        }
      }
    };
    void fetchLog();
    void fetchPlanActivity();
    const t = window.setInterval(() => {
      void fetchLog();
      void fetchPlanActivity();
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [showLlmTerminal, runId, liveWsUrl]);

  useEffect(() => {
    if (!liveWsUrl) return;
    if (!showLlmTerminal && !showRenderProgress) return;
    const ws = new WebSocket(liveWsUrl);
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as {
          llm?: string;
          planActivity?: PlanActivityPayload;
          renderActivity?: RenderActivityPayload;
        };
        if (data.llm !== undefined) setLlmActivityText(data.llm);
        if (data.planActivity !== undefined) {
          setPlanActivityErr(null);
          setPlanActivity(data.planActivity);
        }
        if (data.renderActivity !== undefined) {
          setRenderActivityErr(null);
          setRenderActivity(data.renderActivity);
        }
      } catch {
        /* ignore malformed */
      }
    };
    return () => {
      ws.close();
    };
  }, [liveWsUrl, showLlmTerminal, showRenderProgress, runId]);

  useEffect(() => {
    if (!showLlmTerminal) return;
    if (llmActivityText == null && !showRenderProgress) return;
    llmTerminalEndRef.current?.scrollIntoView({ block: "end" });
  }, [
    llmActivityText,
    showLlmTerminal,
    showRenderProgress,
    renderActivity,
    renderActivityErr,
  ]);

  useEffect(() => {
    if (!showRenderProgress) {
      setRenderActivity(null);
      setRenderActivityErr(null);
      return;
    }
    if (liveWsUrl) {
      return;
    }
    let cancelled = false;
    const fetchRenderActivity = async () => {
      try {
        const res = await fetch(renderActivityUrl(runId), { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 404) {
          setRenderActivity(null);
          setRenderActivityErr(null);
          return;
        }
        if (!res.ok) {
          setRenderActivityErr(`HTTP ${res.status}`);
          setRenderActivity(null);
          return;
        }
        const j = (await res.json()) as RenderActivityPayload;
        setRenderActivityErr(null);
        setRenderActivity(j);
      } catch {
        if (!cancelled) {
          setRenderActivityErr("network error");
          setRenderActivity(null);
        }
      }
    };
    void fetchRenderActivity();
    const t = window.setInterval(() => {
      void fetchRenderActivity();
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [showRenderProgress, runId, liveWsUrl]);

  async function startPipeline(opts?: { skipLlm?: boolean }) {
    setStartErr(null);
    if (outputKind === "google_drive") {
      if (!gdriveFolderId.trim()) {
        setStartErr("Enter a Google Drive folder URL or folder ID for output.");
        return;
      }
      if (gdriveStatus && !gdriveStatus.connected) {
        setStartErr("Connect Google Drive under Settings first.");
        return;
      }
    }
    if (outputKind === "youtube") {
      if (youtubeStatus && !youtubeStatus.connected) {
        setStartErr("Connect YouTube under Settings first (OAuth in browser).");
        return;
      }
    }
    if (outputKind === "s3") {
      if (s3Status && !s3Status.configured) {
        setStartErr("Configure S3 in Settings first.");
        return;
      }
    }
    if (outputKind === "smb") {
      if (smbStatus && !smbStatus.configured) {
        setStartErr("Configure SMB in Settings first.");
        return;
      }
    }
    if (outputKind === "local_bind") {
      if (!localBindPath.trim()) {
        setStartErr("Enter the container path where rendered clips should be copied.");
        return;
      }
    }
    setBusy(true);
    setStartingPipeline(true);
    try {
      const body: Record<string, unknown> = {
        skip_llm_plan: opts?.skipLlm === true,
        audio_stream_index: audioStreamIndex,
        output_destination: {
          kind: outputKind,
          ...(outputKind === "google_drive"
            ? { google_drive_folder_id: gdriveFolderId.trim() }
            : {}),
          ...(outputKind === "youtube"
            ? {
                youtube_privacy: youtubePrivacy,
                youtube_distribution: youtubeDistribution,
                youtube_account_ids: Array.from(youtubeAccountSelected),
              }
            : {}),
          ...(outputKind === "s3" && s3Prefix.trim()
            ? { s3_key_prefix: s3Prefix.trim() }
            : {}),
          ...(outputKind === "smb" && smbSubpath.trim()
            ? { smb_subpath: smbSubpath.trim() }
            : {}),
          ...(outputKind === "local_bind"
            ? { local_bind_path: localBindPath.trim() }
            : {}),
        },
      };
      await jsonFetch(publicApiUrl(`/api/runs/${runId}/start`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      await poll();
    } catch (e) {
      setStartErr(e instanceof Error ? e.message : "Start failed");
    } finally {
      setStartingPipeline(false);
      setBusy(false);
    }
  }

  async function cancelRun() {
    setCancelErr(null);
    setBusy(true);
    try {
      await jsonFetch(publicApiUrl(`/api/runs/${runId}/cancel`), { method: "POST" });
      await poll();
    } catch (e) {
      setCancelErr(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  async function stopLiveRecording() {
    setStopLiveErr(null);
    setBusy(true);
    try {
      await jsonFetch(publicApiUrl(`/api/runs/${runId}/live/stop`), { method: "POST" });
      await poll();
    } catch (e) {
      setStopLiveErr(e instanceof Error ? e.message : "Could not stop recording");
    } finally {
      setBusy(false);
    }
  }

  function copyPublishLine(text: string, key: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedField(key);
      window.setTimeout(() => setCopiedField(null), 2000);
    });
  }

  async function deleteRun() {
    setDeleteErr(null);
    setBusy(true);
    try {
      await jsonFetch(publicApiUrl(`/api/runs/${runId}`), { method: "DELETE" });
      router.push("/runs");
      router.refresh();
    } catch (e) {
      setDeleteErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function restartRun() {
    setRestartErr(null);
    setBusy(true);
    try {
      await jsonFetch(publicApiUrl(`/api/runs/${runId}/restart`), { method: "POST" });
      await poll();
      await loadArtifacts();
      router.refresh();
    } catch (e) {
      setRestartErr(e instanceof Error ? e.message : "Restart failed");
    } finally {
      setBusy(false);
    }
  }

  const mp4Artifacts = artifacts.filter((a) => a.path.toLowerCase().endsWith(".mp4"));
  const renderedMp4s = mp4Artifacts.filter((a) =>
    a.path.replace(/\\/g, "/").toLowerCase().startsWith("rendered/"),
  );
  const artifactGrouped = groupArtifactsByDirectory(artifacts);
  const hasLlmActivityLog = artifacts.some((a) => a.path === "llm_activity.log");
  const hasCutPlan = artifacts.some((a) => a.path === "cut_plan.json");
  const publishClipsWithFiles =
    publishClips?.filter((c) => c.artifactPath) ?? [];
  const hasTranscriptJson = artifacts.some((a) => a.path === "transcript.json");
  const showPlanningOutputsCard =
    (run.status === "completed" || run.status === "failed") &&
    (hasLlmActivityLog || hasCutPlan || hasTranscriptJson);
  const showPlanningLlmArchiveTerminal =
    showPlanningOutputsCard && hasLlmActivityLog && runUsesLlmPlan(run);

  useEffect(() => {
    if (!showPlanningLlmArchiveTerminal) {
      setLlmArchiveLogText(null);
      setLlmArchiveLogErr(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(llmActivityUrl(runId), { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          setLlmArchiveLogErr(`Could not load log (${res.status})`);
          setLlmArchiveLogText(null);
          return;
        }
        const text = await res.text();
        if (cancelled) return;
        setLlmArchiveLogErr(null);
        setLlmArchiveLogText(text);
      } catch (e) {
        if (!cancelled) {
          setLlmArchiveLogErr(e instanceof Error ? e.message : "Failed to load log");
          setLlmArchiveLogText(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, showPlanningLlmArchiveTerminal]);

  useEffect(() => {
    if (llmArchiveLogText == null || !showPlanningLlmArchiveTerminal) return;
    llmArchiveLogEndRef.current?.scrollIntoView({ block: "end" });
  }, [llmArchiveLogText, showPlanningLlmArchiveTerminal]);

  const overview = computePipelineOverview(run, { startingPipeline });
  const llmHeaderSubtitle = useMemo(
    () => llmTerminalHeaderSubtitle(run.step, planActivity, renderActivity),
    [run.step, planActivity, renderActivity],
  );
  const showPipelineProgress =
    startingPipeline || isPipelineInProgress(run);
  const progressPct = overview.progressPercent;
  const progressLabel = pipelineProgressAriaLabel(run, startingPipeline);
  const publishedYt = publishedYoutubeVideos(run);

  const planActivityStaleSeconds =
    planActivity != null && typeof planActivity.updatedAtMs === "number"
      ? Math.max(0, (Date.now() - planActivity.updatedAtMs) / 1000)
      : null;
  const planActivityLooksStuck =
    planActivityStaleSeconds != null && planActivityStaleSeconds > 120;

  const audioReady =
    audioStreams != null &&
    audioStreams.length > 0 &&
    audioStreamsErr == null;
  const startBlockedByAudio = run.status === "ready" && !audioReady;

  return (
    <>
      {showPipelineProgress ? (
        <div
          className="fixed top-14 left-0 right-0 z-50 h-1 overflow-hidden bg-muted/80 shadow-sm lg:top-0"
          role="progressbar"
          aria-busy={true}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPct ?? undefined}
          aria-label={progressLabel}
        >
          {progressPct === null ? (
            <div
              className="absolute inset-y-0 left-0 h-full w-2/5 bg-primary animate-upload-indeterminate-slide"
              aria-hidden
            />
          ) : (
            <div
              className="h-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          )}
        </div>
      ) : null}
      <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/runs"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Back to runs
          </Link>
          <h1 className="mt-3 font-heading text-2xl font-semibold tracking-tight md:text-3xl">
            {run.title || run.sourceFilename || run.id}
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{run.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {run.status === "recording" ? (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void stopLiveRecording()}
            >
              Stop recording
            </Button>
          ) : null}
          {run.status === "ready" && llmStatus?.configured === true ? (
            <Button
              type="button"
              disabled={busy || startBlockedByAudio}
              onClick={() => void startPipeline()}
            >
              Start pipeline
            </Button>
          ) : null}
          {run.status === "ready" && llmStatus?.configured === false ? (
            <>
              <Link
                href="/settings"
                className={cn(
                  buttonVariants({ variant: "secondary" }),
                  (busy || startBlockedByAudio) && "pointer-events-none opacity-50",
                )}
                aria-disabled={busy || startBlockedByAudio}
              >
                Configure LLM first
              </Link>
              <Button
                type="button"
                disabled={busy || startBlockedByAudio}
                onClick={() => void startPipeline({ skipLlm: true })}
              >
                Run without LLM
              </Button>
            </>
          ) : null}
          {run.status === "ready" && llmStatus == null ? (
            <Button type="button" disabled>
              Checking LLM…
            </Button>
          ) : null}
          <>
            <ConfirmAlertDialog
              open={restartDialogOpen}
              onOpenChange={setRestartDialogOpen}
              title="Restart this run?"
              description="Pipeline outputs in this run’s workspace (transcript, cut plan, rendered clips, logs) will be removed. The source video stays. You can start the pipeline again when the run is ready."
              confirmLabel="Restart run"
              cancelLabel="Cancel"
              onConfirm={() => void restartRun()}
            />
            <ConfirmAlertDialog
              open={deleteDialogOpen}
              onOpenChange={setDeleteDialogOpen}
              title="Delete this run?"
              description="This removes the run and its workspace folder on the server."
              confirmLabel="Delete run"
              cancelLabel="Keep"
              onConfirm={deleteRun}
            />
            {run.status === "completed" || run.status === "failed" || run.status === "cancelled" ? (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => setRestartDialogOpen(true)}
              >
                Restart run
              </Button>
            ) : null}
            <Button
              type="button"
              variant="destructive"
              disabled={busy || run.status === "running"}
              onClick={() => setDeleteDialogOpen(true)}
            >
              Delete run
            </Button>
          </>
        </div>
      </div>

      <PipelineTracker run={run} startingPipeline={startingPipeline} />

      {showRenderProgress && !runUsesLlmPlan(run) ? (
        <Card>
          <CardHeader>
            <CardTitle>Render progress</CardTitle>
            <CardDescription>
              Live clip index while FFmpeg encodes (same data as{" "}
              <code className="text-xs">render_activity.json</code> in the workspace).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RenderProgressBody
              renderActivity={renderActivity}
              renderActivityErr={renderActivityErr}
            />
          </CardContent>
        </Card>
      ) : null}

      {run.status === "ready" && llmStatus?.configured === false ? (
        <p className="text-sm text-muted-foreground max-w-2xl">
          The LLM is not configured. Add an API key under Settings for intelligent cuts, or use{" "}
          <span className="font-medium text-foreground">Run without LLM</span> for simple time-based
          clips.
        </p>
      ) : null}

      {run.status === "ready" ? (
        <Card>
          <CardHeader>
            <CardTitle>Audio track</CardTitle>
            <CardDescription>
              Ingest and rendered clips use the same stream. Multi-track containers (e.g. MKV) need a
              choice here before starting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {audioStreams === null && !audioStreamsErr ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                <span>Detecting audio streams…</span>
              </div>
            ) : null}
            {audioStreamsErr ? (
              <p className="text-destructive text-sm">{audioStreamsErr}</p>
            ) : null}
            {audioStreams && audioStreams.length > 1 ? (
              <div className="space-y-2" role="radiogroup" aria-label="Audio track for ingest">
                {audioStreams.map((s) => (
                  <label
                    key={s.index}
                    className="flex cursor-pointer items-start gap-2 rounded-md border border-border/60 p-2 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5"
                  >
                    <input
                      type="radio"
                      name="audio-track"
                      className="mt-1"
                      checked={audioStreamIndex === s.index}
                      onChange={() => setAudioStreamIndex(s.index)}
                    />
                    <span className="text-foreground">{formatAudioStreamLabel(s)}</span>
                  </label>
                ))}
              </div>
            ) : null}
            {audioStreams && audioStreams.length === 1 ? (
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Using:</span>{" "}
                {formatAudioStreamLabel(audioStreams[0])}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {run.status === "ready" ? (
        <Card>
          <CardHeader>
            <CardTitle>Output destination</CardTitle>
            <CardDescription>
              Where rendered clips go after this run finishes. Import sources are chosen on the{" "}
              <Link href="/import" className="text-primary underline-offset-4 hover:underline">
                Import
              </Link>{" "}
              page; this only affects pipeline output.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex flex-col gap-3">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="out"
                  className="mt-1"
                  checked={outputKind === "workspace"}
                  onChange={() => setOutputKind("workspace")}
                />
                <span>
                  <span className="font-medium text-foreground">Workspace (default)</span>
                  <span className="block text-muted-foreground">
                    Keep files on the server under this run until you delete them.
                  </span>
                </span>
              </label>
              {showGoogleDrive ? (
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="radio"
                    name="out"
                    className="mt-1"
                    checked={outputKind === "google_drive"}
                    onChange={() => setOutputKind("google_drive")}
                  />
                  <span>
                    <span className="font-medium text-foreground">Google Drive folder</span>
                    <span className="block text-muted-foreground">
                      Upload rendered MP4s to a folder in your Drive (BYOC OAuth in Settings).
                    </span>
                  </span>
                </label>
              ) : null}
              {showYouTube ? (
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="radio"
                    name="out"
                    className="mt-1"
                    checked={outputKind === "youtube"}
                    onChange={() => setOutputKind("youtube")}
                  />
                  <span>
                    <span className="font-medium text-foreground">YouTube</span>
                    <span className="block text-muted-foreground">
                      Upload rendered clips to one or more connected channels — pick distribution and
                      which channels apply (Settings → YouTube).
                    </span>
                  </span>
                </label>
              ) : null}
              {showS3 ? (
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="radio"
                    name="out"
                    className="mt-1"
                    checked={outputKind === "s3"}
                    onChange={() => setOutputKind("s3")}
                  />
                  <span>
                    <span className="font-medium text-foreground">S3-compatible bucket</span>
                    <span className="block text-muted-foreground">
                      Upload rendered MP4s with credentials from Settings (AWS, MinIO, R2, etc.).
                    </span>
                  </span>
                </label>
              ) : null}
              {showSmb ? (
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="radio"
                    name="out"
                    className="mt-1"
                    checked={outputKind === "smb"}
                    onChange={() => setOutputKind("smb")}
                  />
                  <span>
                    <span className="font-medium text-foreground">SMB (LAN / private network)</span>
                    <span className="block text-muted-foreground">
                      Copy to a share configured in Settings. For cloud/VPS, prefer S3 or Drive; do
                      not expose SMB to the internet.
                    </span>
                  </span>
                </label>
              ) : null}
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="out"
                  className="mt-1"
                  checked={outputKind === "local_bind"}
                  onChange={() => setOutputKind("local_bind")}
                />
                <span>
                  <span className="font-medium text-foreground">Local path (bind mount)</span>
                  <span className="block text-muted-foreground">
                    Copy rendered MP4s to a directory inside the API container (host folder mounted
                    via Docker). Register allowlisted paths under Settings → Storage → Local path.
                  </span>
                </span>
              </label>
            </div>
            {outputKind === "google_drive" ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-muted-foreground">Drive folder URL or ID</span>
                <input
                  className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={gdriveFolderId}
                  onChange={(e) => setGdriveFolderId(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/…"
                />
                {gdriveStatus && !gdriveStatus.connected ? (
                  <p className="text-destructive">
                    Google Drive is not connected. Open{" "}
                    <Link href="/settings" className="underline">
                      Settings
                    </Link>{" "}
                    and complete OAuth (you may need to re-authorize for uploads).
                  </p>
                ) : null}
              </label>
            ) : null}
            {outputKind === "youtube" ? (
              <div className="space-y-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground">Visibility for new uploads</span>
                  <select
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={youtubePrivacy}
                    onChange={(e) =>
                      setYoutubePrivacy(e.target.value as YouTubePrivacy)
                    }
                  >
                    <option value="private">Private</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground">Channel distribution</span>
                  <select
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={youtubeDistribution}
                    onChange={(e) =>
                      setYoutubeDistribution(e.target.value as YoutubeDistribution)
                    }
                  >
                    <option value="single">Single channel (first selected)</option>
                    <option value="random">Random per clip</option>
                    <option value="round_robin">Round-robin per clip</option>
                    <option value="random_run">One random channel for this run</option>
                    <option value="broadcast">Same clip to every selected channel</option>
                  </select>
                </label>
                {youtubeStatus?.accounts && youtubeStatus.accounts.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <span className="text-muted-foreground">Channels</span>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {youtubeAccountSelected.size} selected
                          {youtubeConnectedIds.length > 0
                            ? ` · ${youtubeConnectedIds.length} connected`
                            : ""}
                          {" · "}
                          {youtubeStatus.accounts.length} total
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-8"
                          onClick={() => {
                            setYoutubeAccountSelected(new Set(youtubeConnectedIds));
                          }}
                        >
                          Select all connected
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => setYoutubeAccountSelected(new Set())}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                    {youtubeStatus.accounts.length >= 4 ? (
                      <label className="flex flex-col gap-1.5">
                        <span className="sr-only">Filter channels</span>
                        <input
                          className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={youtubeChannelFilter}
                          onChange={(e) => setYoutubeChannelFilter(e.target.value)}
                          placeholder="Filter channels by name…"
                          autoComplete="off"
                        />
                      </label>
                    ) : null}
                    {youtubeAccountsFiltered.length === 0 ? (
                      <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                        No channels match this filter.
                      </p>
                    ) : (
                      <ul className="max-h-[min(22rem,55vh)] space-y-1 overflow-y-auto rounded-md border border-border p-2">
                        {youtubeAccountsFiltered.map((a) => (
                          <li key={a.id}>
                            <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug">
                              <input
                                type="checkbox"
                                className="mt-0.5 rounded border-input"
                                checked={youtubeAccountSelected.has(a.id)}
                                disabled={!a.connected}
                                onChange={(e) => {
                                  setYoutubeAccountSelected((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(a.id);
                                    else next.delete(a.id);
                                    return next;
                                  });
                                }}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="font-medium text-foreground">
                                  {a.channelTitle || "Channel"}
                                </span>
                                {!a.connected ? (
                                  <span className="block text-xs text-muted-foreground">
                                    Not connected — reconnect in Settings
                                  </span>
                                ) : null}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Checked channels limit which accounts are used for this run. If none are
                      checked, every connected account is eligible. Quota is per Google Cloud project,
                      not per channel.
                    </p>
                  </div>
                ) : null}
                {youtubeStatus && !youtubeStatus.connected ? (
                  <p className="text-destructive">
                    YouTube is not connected. Open{" "}
                    <Link href="/settings" className="underline">
                      Settings
                    </Link>{" "}
                    → YouTube and complete OAuth.
                  </p>
                ) : null}
              </div>
            ) : null}
            {outputKind === "s3" ? (
              <div className="space-y-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground">
                    Object key prefix (optional — default is Settings prefix + this run id)
                  </span>
                  <input
                    className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={s3Prefix}
                    onChange={(e) => setS3Prefix(e.target.value)}
                    placeholder="team/exports/"
                  />
                </label>
              </div>
            ) : null}
            {outputKind === "smb" ? (
              <div className="space-y-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground">
                    Extra path under your SMB base (optional)
                  </span>
                  <input
                    className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={smbSubpath}
                    onChange={(e) => setSmbSubpath(e.target.value)}
                    placeholder="projects/show-a"
                  />
                </label>
              </div>
            ) : null}
            {outputKind === "local_bind" ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-muted-foreground">
                  Destination directory (absolute path in the container)
                </span>
                <input
                  className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={localBindPath}
                  onChange={(e) => setLocalBindPath(e.target.value)}
                  placeholder="/exports/clips"
                />
                <p className="text-xs text-muted-foreground">
                  Must be under the workspace, <code className="text-xs">CLIPENGINE_IMPORT_ROOTS</code>
                  , or a path listed in Settings → Storage → Local path.
                </p>
              </label>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="space-y-1">
            <CardTitle>Run details</CardTitle>
            <CardDescription>
              Source, transcription, and API fields. Status above updates automatically while
              the job runs.
            </CardDescription>
          </div>
          {showPipelineProgress && (isPipelineInProgress(run) || startingPipeline) ? (
            <>
              <ConfirmAlertDialog
                open={cancelDialogOpen}
                onOpenChange={setCancelDialogOpen}
                title="Stop this run?"
                description="Work inside the current step may continue briefly before the job stops."
                confirmLabel="Cancel run"
                cancelLabel="Keep running"
                onConfirm={cancelRun}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 border-destructive/35 text-destructive hover:bg-destructive/10"
                disabled={busy}
                onClick={() => setCancelDialogOpen(true)}
              >
                <CircleStop className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Cancel run
              </Button>
            </>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid gap-1 sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Status:</span> {run.status}
            </div>
            <div>
              <span className="text-muted-foreground">Step:</span> {run.step ?? "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Source:</span> {run.sourceType}
            </div>
            <div>
              <span className="text-muted-foreground">Transcription:</span>{" "}
              {runTranscriptionLabel(run)}
            </div>
          </div>
          {run.youtubeUrl ? (
            <p>
              <span className="text-muted-foreground">URL:</span>{" "}
              <a
                href={run.youtubeUrl}
                className="break-all text-primary underline-offset-4 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {run.youtubeUrl}
              </a>
            </p>
          ) : null}
          {run.localSourcePath ? (
            <p>
              <span className="text-muted-foreground">Local:</span>{" "}
              <code className="text-xs">{run.localSourcePath}</code>
            </p>
          ) : null}
          {publishedYt.length > 0 ? (
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Published on YouTube
              </p>
              <ul className="mt-2 space-y-2 text-sm">
                {publishedYt.map((v) => (
                  <li
                    key={`${v.watchUrl}-${v.path}`}
                    className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
                  >
                    <div className="min-w-0">
                      {v.channelTitle ? (
                        <div className="text-xs font-medium text-foreground">{v.channelTitle}</div>
                      ) : null}
                      <code className="break-all text-xs text-muted-foreground">{v.path}</code>
                    </div>
                    <a
                      href={v.watchUrl}
                      className="shrink-0 text-primary underline-offset-4 hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open on YouTube
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {run.error ? (
            <p
              className={cn(
                "rounded-md border p-2",
                run.status === "cancelled"
                  ? "border-border bg-muted/40 text-muted-foreground"
                  : "border-destructive/40 bg-destructive/10 text-destructive",
              )}
            >
              {run.error}
            </p>
          ) : null}
          {startErr ? <p className="text-destructive">{startErr}</p> : null}
          {cancelErr ? <p className="text-destructive">{cancelErr}</p> : null}
          {stopLiveErr ? <p className="text-destructive">{stopLiveErr}</p> : null}
          {deleteErr ? <p className="text-destructive">{deleteErr}</p> : null}
          {restartErr ? <p className="text-destructive">{restartErr}</p> : null}
        </CardContent>
      </Card>

      {showPlanningOutputsCard ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-400/90" aria-hidden />
              <CardTitle>Planning &amp; LLM output</CardTitle>
            </div>
            <CardDescription>
              During a run, the LLM panel is live in the <span className="font-medium">plan</span> step
              and stays visible with the saved log while <span className="font-medium">render</span> runs.
              After the run finishes, the planning log is shown in the terminal below (and you can still
              download the raw file).
              {runUsesLlmPlan(run)
                ? " This run used the configured LLM for cut planning."
                : " This run used the heuristic planner (no LLM)."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="space-y-2">
              {hasCutPlan ? (
                <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Braces className="h-4 w-4 shrink-0 text-amber-400/90" aria-hidden />
                    <div className="min-w-0">
                      <span className="font-medium text-foreground">Cut plan</span>
                      <code className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                        cut_plan.json
                      </code>
                    </div>
                  </div>
                  <a
                    className="shrink-0 text-primary underline-offset-4 hover:underline"
                    href={artifactDownloadUrl(runId, "cut_plan.json")}
                  >
                    Download
                  </a>
                </li>
              ) : null}
              {hasTranscriptJson ? (
                <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Braces className="h-4 w-4 shrink-0 text-amber-400/90" aria-hidden />
                    <div className="min-w-0">
                      <span className="font-medium text-foreground">Transcript (Whisper)</span>
                      <code className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                        transcript.json
                      </code>
                    </div>
                  </div>
                  <a
                    className="shrink-0 text-primary underline-offset-4 hover:underline"
                    href={artifactDownloadUrl(runId, "transcript.json")}
                  >
                    Download
                  </a>
                </li>
              ) : null}
              {hasLlmActivityLog && runUsesLlmPlan(run) ? (
                <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <ScrollText className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                    <div className="min-w-0">
                      <span className="font-medium text-foreground">LLM activity log</span>
                      <code className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                        llm_activity.log
                      </code>
                    </div>
                  </div>
                  <a
                    className="shrink-0 text-primary underline-offset-4 hover:underline"
                    href={artifactDownloadUrl(runId, "llm_activity.log")}
                  >
                    Download
                  </a>
                </li>
              ) : null}
              {hasLlmActivityLog && !runUsesLlmPlan(run) ? (
                <li className="rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-2 text-muted-foreground">
                  <span className="font-medium text-foreground">LLM activity log</span> — not used
                  (heuristic plan). File may be absent or empty.
                </li>
              ) : null}
            </ul>
            {showPlanningLlmArchiveTerminal ? (
              <div
                className="overflow-hidden rounded-xl border border-zinc-700/70 bg-zinc-950/95 shadow-md ring-1 ring-zinc-800/50 dark:bg-zinc-950"
                role="region"
                aria-label="Saved LLM planning log"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/90 px-4 py-3.5 sm:px-5">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full bg-emerald-500/90 shadow-[0_0_8px_rgba(16,185,129,0.45)]"
                      aria-hidden
                    />
                    <span className="font-mono text-sm tracking-tight text-zinc-100">LLM</span>
                    <span className="font-mono text-[11px] text-zinc-500">plan step · saved</span>
                  </div>
                  <code className="max-w-[min(100%,14rem)] truncate font-mono text-[10px] text-zinc-500">
                    llm_activity.log
                  </code>
                </div>
                <div
                  className="max-h-96 min-h-[10rem] overflow-auto border-t border-zinc-800/30 bg-zinc-950/40 px-4 py-4 font-mono text-[11px] leading-relaxed text-emerald-400/85 selection:bg-emerald-500/15 sm:px-5"
                  role="log"
                >
                  {llmArchiveLogErr ? (
                    <span className="text-red-400/90">{llmArchiveLogErr}</span>
                  ) : llmArchiveLogText === null ? (
                    <span className="flex items-center gap-2 text-zinc-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      Loading log…
                    </span>
                  ) : llmArchiveLogText === "" ? (
                    <span className="text-zinc-500">Log file is empty.</span>
                  ) : (
                    <>
                      <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-inherit">
                        {llmArchiveLogText}
                      </pre>
                      <div ref={llmArchiveLogEndRef} className="h-px" aria-hidden />
                    </>
                  )}
                </div>
                <p className="border-t border-zinc-800/80 px-4 py-3 font-mono text-[10px] leading-relaxed text-zinc-500 sm:px-5">
                  Same stream as live planning: foundation LLM, web search, cut plan (Whisper and
                  render are not shown). See also{" "}
                  <code className="text-zinc-400">plan_activity.json</code> for structured progress.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {showLlmTerminal ? (
        <Card className="gap-0 overflow-hidden border-zinc-700/70 bg-zinc-950/95 py-0 shadow-md ring-1 ring-zinc-800/60 dark:bg-zinc-950">
          <CardHeader className="gap-4 border-b border-zinc-800/90 px-5 pb-5 pt-5">
            <div
              className="flex min-w-0 flex-wrap items-center gap-2.5"
              aria-label={`LLM console · ${llmHeaderSubtitle}`}
            >
              <span
                className={cn(
                  "h-2.5 w-2.5 shrink-0 rounded-full",
                  run.step === "plan"
                    ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                    : renderActivity?.phase === "render_complete"
                      ? "bg-emerald-500/90 shadow-[0_0_8px_rgba(16,185,129,0.45)]"
                      : "bg-sky-500/90 shadow-[0_0_8px_rgba(14,165,233,0.45)]",
                )}
                aria-hidden
              />
              <CardTitle className="font-mono text-sm tracking-tight text-zinc-100">
                LLM
              </CardTitle>
              <span
                className="min-w-0 max-w-[min(100%,36rem)] truncate font-mono text-[11px] text-zinc-500"
                title={llmHeaderSubtitle}
              >
                {llmHeaderSubtitle}
              </span>
            </div>
            {run.step === "render" ? null : planActivity ? (
              <div className="space-y-2 rounded-lg border border-zinc-700/60 bg-zinc-900/70 px-4 py-3.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
                <p className="font-mono text-[11px] leading-relaxed text-zinc-200">
                  <span className="text-zinc-500">Current: </span>
                  {formatPlanActivityLine(planActivity)}
                </p>
                {planActivityStaleSeconds != null ? (
                  <p className="font-mono text-[10px] text-zinc-500">
                    Last update {formatPlanActivityStale(planActivityStaleSeconds)}
                  </p>
                ) : null}
                {planActivityLooksStuck ? (
                  <p className="font-mono text-[10px] leading-snug text-amber-400/95">
                    No heartbeat for 2+ min — check Docker logs, API reload, or a slow/blocked web
                    search provider.
                  </p>
                ) : null}
                {planActivityErr ? (
                  <p className="font-mono text-[10px] text-zinc-600">{planActivityErr}</p>
                ) : null}
              </div>
            ) : planActivityErr ? (
              <p className="font-mono text-[10px] text-zinc-500">{planActivityErr}</p>
            ) : (
              <p className="font-mono text-[10px] text-zinc-600">
                Waiting for plan activity…
              </p>
            )}
            <CardDescription className="text-pretty font-mono text-[11px] leading-relaxed text-zinc-500">
              {run.step === "plan" ? (
                <>
                  Foundation LLM, web search, and cut plan stream to the log below (Whisper and
                  render are not shown here).
                </>
              ) : (
                <>
                  <span className="text-zinc-400">Now:</span> FFmpeg is encoding clips from the cut
                  plan.{" "}
                  <span className="text-zinc-400">Console:</span> full debug output (verbatim{" "}
                  <code className="text-zinc-500">llm_activity.log</code> plus live render status)—not
                  a filtered summary.
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div
              className="max-h-72 min-h-[8rem] overflow-auto border-t border-zinc-800/40 bg-zinc-950/50 px-4 py-4 font-mono text-[11px] leading-relaxed text-emerald-400/85 selection:bg-emerald-500/15 sm:px-5"
              role="log"
              aria-live="polite"
              aria-label={
                showRenderProgress ? "LLM planning log and render progress" : "LLM planning activity"
              }
            >
              {llmActivityText === null ? (
                <span className="text-zinc-500">Connecting…</span>
              ) : llmActivityText === "" ? (
                <span className="text-zinc-500">Waiting for LLM output…</span>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-inherit">
                  {llmActivityText}
                </pre>
              )}
              {showRenderProgress ? (
                <div className="mt-4 border-t border-emerald-500/30 pt-4 text-left">
                  <RenderProgressBody
                    variant="terminal"
                    renderActivity={renderActivity}
                    renderActivityErr={renderActivityErr}
                  />
                </div>
              ) : null}
              <div ref={llmTerminalEndRef} className="h-px" aria-hidden />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Artifacts</CardTitle>
          <CardDescription>
            Files under this run&apos;s workspace, grouped by folder. Rendered clips live under{" "}
            <code className="text-xs">rendered/longform/</code> and{" "}
            <code className="text-xs">rendered/shortform/</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {artErr ? <p className="text-sm text-destructive">{artErr}</p> : null}
          {artifacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No files yet.</p>
          ) : (
            <div className="max-h-[28rem] space-y-4 overflow-y-auto pr-1">
              {artifactGrouped.map(({ dir, entries }) => (
                <div key={dir || "__root__"} className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="font-mono">{dir === "" ? "(workspace root)" : `${dir}/`}</span>
                  </div>
                  <ul className="space-y-1 border-l border-border/80 pl-3">
                    {entries.map((a) => {
                      const name = a.path.includes("/") ? a.path.slice(a.path.lastIndexOf("/") + 1) : a.path;
                      return (
                        <li
                          key={a.path}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md py-1.5 pl-1 pr-0 hover:bg-muted/40"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <ArtifactFileIcon path={a.path} />
                            <div className="min-w-0">
                              <span className="font-mono text-xs text-foreground">{name}</span>
                              <span className="ml-2 text-[11px] text-muted-foreground tabular-nums">
                                {formatArtifactBytes(a.size)}
                              </span>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            {isVideoArtifactPath(a.path) ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() =>
                                  setPreviewArtifact({ path: a.path, title: name })
                                }
                              >
                                Preview
                              </Button>
                            ) : null}
                            <a
                              className="text-xs text-primary underline-offset-4 hover:underline"
                              href={artifactDownloadUrl(runId, a.path)}
                            >
                              Download
                            </a>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {publishClipsErr ? (
        <p className="text-sm text-destructive">{publishClipsErr}</p>
      ) : null}

      {publishClipsWithFiles.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Publish copy</CardTitle>
            <CardDescription>
              Resolved title and description for uploads (see Settings → Publishing). Matches{" "}
              <code className="text-xs">publish.txt</code> in each quick-download ZIP.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {publishClipsWithFiles.map((c) => {
              const pt = c.publishTitle ?? c.title;
              const pd = c.publishDescription ?? "";
              const idKey = c.id;
              return (
                <div
                  key={c.id}
                  className="rounded-lg border border-border bg-muted/20 px-3 py-3 text-sm"
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {c.kind} · {c.artifactPath}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Title</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs"
                          onClick={() => copyPublishLine(pt, `${idKey}-title`)}
                        >
                          {copiedField === `${idKey}-title` ? (
                            <Check className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <Copy className="h-3.5 w-3.5" aria-hidden />
                          )}
                          Copy
                        </Button>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-foreground">{pt}</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Description</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs"
                          onClick={() => copyPublishLine(pd, `${idKey}-desc`)}
                        >
                          {copiedField === `${idKey}-desc` ? (
                            <Check className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <Copy className="h-3.5 w-3.5" aria-hidden />
                          )}
                          Copy
                        </Button>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                        {pd || "—"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {renderedMp4s.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Quick downloads</CardTitle>
            <CardDescription>
              Each clip downloads as a <span className="font-medium">.zip</span> with the MP4, the
              matching thumbnail (same name, <code className="text-xs">.jpg</code> next to the video)
              when available, plus <code className="text-xs">publish.txt</code> and{" "}
              <code className="text-xs">publish_metadata.json</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {renderedMp4s.map((a) => (
              <a
                key={a.path}
                href={renderedClipZipUrl(runId, a.path)}
                className="max-w-full rounded-md border border-border bg-muted/40 px-3 py-2 text-left text-sm leading-snug hover:bg-muted"
                title={a.path}
              >
                <span className="block truncate font-medium text-foreground">
                  {clipTitleFromMp4Path(a.path)}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                  {a.path}
                </span>
              </a>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {previewArtifact ? (
        <ArtifactVideoPreviewDialog
          runId={runId}
          artifactPath={previewArtifact.path}
          title={previewArtifact.title}
          open
          onOpenChange={(o) => {
            if (!o) setPreviewArtifact(null);
          }}
        />
      ) : null}
    </div>
    </>
  );
}
