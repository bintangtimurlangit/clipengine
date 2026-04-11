"use client";

import {
  Cloud,
  FolderOpen,
  HardDrive,
  Library,
  Link2,
  Loader2,
  Radio,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CatalogPanel } from "@/components/catalog/catalog-panel";
import { publicApiUrl } from "@/lib/api";
import { DOCS_BIND_MOUNTS_URL } from "@/lib/dashboard-content";
import type { ImportRoot } from "@/types/run";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

async function jsonFetch<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
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

function postFormDataWithProgress(
  url: string,
  formData: FormData,
  onProgress: (loaded: number, total: number) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(e.loaded, e.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
        return;
      }
      let detail = xhr.statusText || `HTTP ${xhr.status}`;
      const r = xhr.response;
      if (r && typeof r === "object" && "detail" in r) {
        const d = (r as { detail?: unknown }).detail;
        if (typeof d === "string") detail = d;
        else if (d != null) detail = JSON.stringify(d);
      }
      reject(new Error(detail));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(formData);
  });
}

type GDriveItem = {
  id: string;
  name: string;
  kind: "folder" | "file";
  mimeType?: string;
};

type S3BrowseResp = {
  bucket: string;
  prefix: string;
  commonPrefixes: string[];
  objects: { key: string; size: number; lastModified: string | null }[];
  isTruncated: boolean;
  nextContinuationToken?: string;
};

type SourceId =
  | "local"
  | "upload"
  | "link"
  | "gdrive"
  | "s3"
  | "catalog"
  | "live";

const SOURCES: {
  id: SourceId;
  label: string;
  description: string;
  icon: typeof Upload;
}[] = [
  {
    id: "local",
    label: "Folder on server",
    description:
      "Allowlisted directories are indexed; pick files or batch-import. Path context helps the LLM.",
    icon: FolderOpen,
  },
  {
    id: "upload",
    label: "Upload",
    description: "Send one file from your machine into the run workspace, then start the pipeline.",
    icon: Upload,
  },
  {
    id: "link",
    label: "YouTube / URL",
    description: "Paste a VOD link — the server downloads with yt-dlp and prepares the run.",
    icon: Link2,
  },
  {
    id: "gdrive",
    label: "Google Drive",
    description: "Browse Drive after you connect OAuth in Settings.",
    icon: Cloud,
  },
  {
    id: "s3",
    label: "S3",
    description: "Browse a configured bucket and import an object into the workspace.",
    icon: HardDrive,
  },
  {
    id: "catalog",
    label: "Catalog",
    description: "Pick from the indexed library (synced folders and cloud sources).",
    icon: Library,
  },
  {
    id: "live",
    label: "YouTube Live",
    description: "Listen to a live stream and auto-clip when this mode is enabled (see Help).",
    icon: Radio,
  },
];

function relativeUnderRoot(filePath: string, root: string): string {
  const f = filePath.replace(/\\/g, "/");
  const r = root.replace(/\\/g, "/").replace(/\/$/, "");
  if (f.startsWith(r + "/")) return f.slice(r.length + 1);
  return filePath.split(/[/\\]/).pop() ?? filePath;
}

export function ImportWizard() {
  const router = useRouter();
  const [source, setSource] = useState<SourceId>("upload");

  const [roots, setRoots] = useState<ImportRoot[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [rootsErr, setRootsErr] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [planningContext, setPlanningContext] = useState("");

  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<
    "idle" | "preparing" | "uploading"
  >("idle");
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadIndeterminate, setUploadIndeterminate] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const [ytUrl, setYtUrl] = useState("");
  const [ytBusy, setYtBusy] = useState(false);
  const [ytErr, setYtErr] = useState<string | null>(null);

  const [selectedRoot, setSelectedRoot] = useState("");
  const [videos, setVideos] = useState<{ name: string; path: string }[]>([]);
  const [listErr, setListErr] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [recursiveList, setRecursiveList] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [shuffleBatch, setShuffleBatch] = useState(false);
  const [useRelativePathContext, setUseRelativePathContext] = useState(true);

  const [gdriveStatus, setGdriveStatus] = useState<{
    connected: boolean;
    hasCredentials: boolean;
  } | null>(null);
  const [gdriveStack, setGdriveStack] = useState<{ id: string; name: string }[]>(
    [{ id: "root", name: "Drive" }],
  );
  const [gdriveFiles, setGdriveFiles] = useState<GDriveItem[]>([]);
  const [gdriveBusy, setGdriveBusy] = useState(false);
  const [gdriveErr, setGdriveErr] = useState<string | null>(null);

  const [s3Configured, setS3Configured] = useState<boolean | null>(null);
  const [s3Prefix, setS3Prefix] = useState("");
  const [s3Browse, setS3Browse] = useState<S3BrowseResp | null>(null);
  const [s3Busy, setS3Busy] = useState(false);
  const [s3Err, setS3Err] = useState<string | null>(null);
  const [s3ImportBusy, setS3ImportBusy] = useState(false);

  const currentFolderId = useMemo(
    () => gdriveStack[gdriveStack.length - 1]?.id ?? "root",
    [gdriveStack],
  );

  const loadRoots = useCallback(async () => {
    setRootsErr(null);
    try {
      const data = await jsonFetch<{ roots: ImportRoot[]; workspace: string }>(
        publicApiUrl("/api/import/roots"),
      );
      setRoots(data.roots);
      setWorkspace(data.workspace);
      setSelectedRoot((prev) => prev || data.roots[0]?.path || "");
    } catch (e) {
      setRootsErr(
        e instanceof Error ? e.message : "Failed to load import roots",
      );
    }
  }, []);

  const loadGdriveStatus = useCallback(async () => {
    try {
      const data = await jsonFetch<{
        connected: boolean;
        hasCredentials: boolean;
      }>(publicApiUrl("/api/google-drive/status"));
      setGdriveStatus(data);
    } catch {
      setGdriveStatus(null);
    }
  }, []);

  const loadS3Status = useCallback(async () => {
    try {
      const data = await jsonFetch<{ configured: boolean }>(
        publicApiUrl("/api/s3/status"),
      );
      setS3Configured(data.configured);
    } catch {
      setS3Configured(false);
    }
  }, []);

  useEffect(() => {
    void loadRoots();
    void loadGdriveStatus();
    void loadS3Status();
  }, [loadRoots, loadGdriveStatus, loadS3Status]);

  const refreshVideos = useCallback(async (dir: string, recursive: boolean) => {
    setListErr(null);
    try {
      const apiPath = publicApiUrl("/api/import/videos");
      const url = apiPath.startsWith("http")
        ? new URL(apiPath)
        : new URL(apiPath, window.location.origin);
      url.searchParams.set("path", dir);
      if (recursive) url.searchParams.set("recursive", "true");
      const data = await jsonFetch<{
        directory: string;
        videos: { name: string; path: string }[];
      }>(url.toString());
      setVideos(data.videos);
      setSelectedPaths(new Set());
    } catch (e) {
      setListErr(e instanceof Error ? e.message : "List failed");
      setVideos([]);
    }
  }, []);

  useEffect(() => {
    if (!selectedRoot) return;
    void refreshVideos(selectedRoot, recursiveList);
  }, [selectedRoot, recursiveList, refreshVideos]);

  const refreshGdrive = useCallback(async () => {
    if (!gdriveStatus?.connected) return;
    setGdriveErr(null);
    setGdriveBusy(true);
    try {
      const apiPath = publicApiUrl("/api/google-drive/files");
      const url = apiPath.startsWith("http")
        ? new URL(apiPath)
        : new URL(apiPath, window.location.origin);
      url.searchParams.set("folder_id", currentFolderId);
      const data = await jsonFetch<{ files: GDriveItem[] }>(url.toString());
      setGdriveFiles(data.files);
    } catch (e) {
      setGdriveErr(e instanceof Error ? e.message : "Drive list failed");
      setGdriveFiles([]);
    } finally {
      setGdriveBusy(false);
    }
  }, [currentFolderId, gdriveStatus?.connected]);

  useEffect(() => {
    if (source === "gdrive" && gdriveStatus?.connected) void refreshGdrive();
  }, [source, gdriveStatus?.connected, refreshGdrive]);

  const refreshS3Browse = useCallback(async () => {
    if (!s3Configured) return;
    setS3Err(null);
    setS3Busy(true);
    try {
      const apiPath = publicApiUrl("/api/s3/browse");
      const url = apiPath.startsWith("http")
        ? new URL(apiPath)
        : new URL(apiPath, window.location.origin);
      url.searchParams.set("prefix", s3Prefix);
      url.searchParams.set("delimiter", "/");
      const data = await jsonFetch<S3BrowseResp>(url.toString());
      setS3Browse(data);
    } catch (e) {
      setS3Err(e instanceof Error ? e.message : "S3 browse failed");
      setS3Browse(null);
    } finally {
      setS3Busy(false);
    }
  }, [s3Configured, s3Prefix]);

  useEffect(() => {
    if (source === "s3" && s3Configured) void refreshS3Browse();
  }, [source, s3Configured, refreshS3Browse]);

  async function onUploadFile(file: File | null) {
    if (!file) return;
    setUploadErr(null);
    setUploadBusy(true);
    setUploadPhase("preparing");
    setUploadPercent(0);
    setUploadIndeterminate(false);
    try {
      const create = await jsonFetch<{ run: { id: string } }>(
        publicApiUrl("/api/runs"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source_type: "upload",
            title: title || null,
            planning_context: planningContext.trim() || null,
          }),
        },
      );
      const fd = new FormData();
      fd.append("file", file);
      setUploadPhase("uploading");
      setUploadIndeterminate(true);
      await postFormDataWithProgress(
        publicApiUrl(`/api/runs/${create.run.id}/upload`),
        fd,
        (loaded, total) => {
          setUploadIndeterminate(false);
          setUploadPercent(Math.min(100, Math.round((100 * loaded) / total)));
        },
      );
      router.push(`/runs/${create.run.id}`);
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadBusy(false);
      setUploadPhase("idle");
      setUploadPercent(0);
      setUploadIndeterminate(false);
    }
  }

  async function onYoutubeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ytUrl.trim()) return;
    setYtErr(null);
    setYtBusy(true);
    try {
      const data = await jsonFetch<{ run: { id: string } }>(
        publicApiUrl("/api/runs"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source_type: "youtube_url",
            youtube_url: ytUrl.trim(),
            title: title || null,
            planning_context: planningContext.trim() || null,
          }),
        },
      );
      router.push(`/runs/${data.run.id}`);
    } catch (e) {
      setYtErr(e instanceof Error ? e.message : "Failed to create run");
    } finally {
      setYtBusy(false);
    }
  }

  async function enqueueLocal(path: string) {
    setLocalErr(null);
    setLocalBusy(true);
    try {
      const rel = selectedRoot
        ? relativeUnderRoot(path, selectedRoot)
        : path;
      const data = await jsonFetch<{ run: { id: string } }>(
        publicApiUrl("/api/runs"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source_type: "local_path",
            local_path: path,
            title: title || null,
            planning_context:
              planningContext.trim() ||
              (useRelativePathContext ? rel : null) ||
              null,
          }),
        },
      );
      router.push(`/runs/${data.run.id}`);
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : "Failed to import file");
    } finally {
      setLocalBusy(false);
    }
  }

  function toggleSelectedPath(path: string) {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function enqueueBatch() {
    if (selectedPaths.size === 0) return;
    setLocalErr(null);
    setLocalBusy(true);
    try {
      const data = await jsonFetch<{ runs: { id: string }[]; count: number }>(
        publicApiUrl("/api/runs/batch"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            local_paths: Array.from(selectedPaths),
            shuffle: shuffleBatch,
            title_prefix: title.trim() || null,
            whisper_model: "tiny",
            whisper_device: "auto",
            whisper_compute_type: "default",
            root_prefix: selectedRoot || null,
            use_relative_path_as_planning_context:
              useRelativePathContext && Boolean(selectedRoot),
          }),
        },
      );
      const first = data.runs[0]?.id;
      if (first) router.push(`/runs/${first}`);
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : "Batch import failed");
    } finally {
      setLocalBusy(false);
    }
  }

  async function importGdriveFile(id: string, name: string) {
    setGdriveErr(null);
    setLocalBusy(true);
    try {
      const data = await jsonFetch<{ run: { id: string } }>(
        publicApiUrl("/api/runs"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source_type: "google_drive",
            google_drive_file_id: id,
            title: title.trim() || name || null,
            planning_context: planningContext.trim() || undefined,
          }),
        },
      );
      router.push(`/runs/${data.run.id}`);
    } catch (e) {
      setGdriveErr(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLocalBusy(false);
    }
  }

  async function importS3Key(key: string) {
    setS3Err(null);
    setS3ImportBusy(true);
    try {
      const data = await jsonFetch<{ run: { id: string } }>(
        publicApiUrl("/api/runs"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source_type: "s3_object",
            s3_key: key,
            title: title.trim() || null,
            planning_context: planningContext.trim() || key || null,
          }),
        },
      );
      router.push(`/runs/${data.run.id}`);
    } catch (e) {
      setS3Err(e instanceof Error ? e.message : "Import failed");
    } finally {
      setS3ImportBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          1 · Choose source
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {SOURCES.map((s) => {
            const Icon = s.icon;
            const active = source === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSource(s.id)}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                    : "border-border/80 bg-card/60 hover:bg-muted/40",
                )}
              >
                <Icon
                  className={cn(
                    "size-5",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span className="font-heading text-sm font-semibold">{s.label}</span>
                <span className="text-xs leading-snug text-muted-foreground">
                  {s.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Card className="border-border/80 bg-gradient-to-br from-card/90 to-muted/20">
        <CardHeader>
          <CardTitle className="font-heading text-lg">2 · Run options</CardTitle>
          <CardDescription>
            Optional title and planning context for the LLM (series, season, episode).{" "}
            Transcription defaults live under{" "}
            <Link
              href="/settings"
              className="text-primary underline-offset-4 hover:underline"
            >
              Settings → Transcription
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Title (optional)</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Episode or project name"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="text-muted-foreground">
              Planning context (optional)
            </span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={planningContext}
              onChange={(e) => setPlanningContext(e.target.value)}
              placeholder="e.g. Star Wars · Season 1 — overrides path-based context when set"
            />
          </label>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          3 · Source details
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Complete the fields below for the source you selected, then open the run to transcribe,
          plan, and render.
        </p>
      </div>

      {source === "local" ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">Folder on server</CardTitle>
            <CardDescription>
              Allowlisted roots come from the workspace,{" "}
              <code className="text-xs">CLIPENGINE_IMPORT_ROOTS</code>, and{" "}
              <Link
                href="/settings"
                className="text-primary underline-offset-4 hover:underline"
              >
                Settings → Storage → Local path
              </Link>
              . Nested folders (e.g. Show → Season → episode) are shown as relative paths — enable
              &quot;Use path as planning context&quot; so the LLM sees that hierarchy. Workspace:{" "}
              <code className="text-xs">{workspace || "—"}</code>.{" "}
              <a
                href={DOCS_BIND_MOUNTS_URL}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                Bind mounts guide
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {rootsErr ? (
              <p className="text-sm text-destructive">{rootsErr}</p>
            ) : null}
            {roots.length === 0 && !rootsErr ? (
              <p className="text-muted-foreground text-sm">
                No import roots yet. Add a bind mount and register the container path in
                Settings, or use upload / URL / cloud sources.
              </p>
            ) : (
              <>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Directory root</span>
                  <select
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={selectedRoot}
                    onChange={(e) => setSelectedRoot(e.target.value)}
                  >
                    {roots.map((r) => (
                      <option key={r.path} value={r.path} disabled={!r.exists}>
                        {r.path}
                        {!r.exists ? " (missing)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="rounded border-input"
                    checked={recursiveList}
                    onChange={(e) => setRecursiveList(e.target.checked)}
                  />
                  <span>Include videos in subfolders</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="rounded border-input"
                    checked={useRelativePathContext}
                    onChange={(e) => setUseRelativePathContext(e.target.checked)}
                  />
                  <span>Use relative path as planning context (recommended for nested libraries)</span>
                </label>
                {listErr ? (
                  <p className="text-sm text-destructive">{listErr}</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={localBusy || videos.length === 0}
                    onClick={() =>
                      setSelectedPaths(
                        selectedPaths.size === videos.length
                          ? new Set()
                          : new Set(videos.map((v) => v.path)),
                      )
                    }
                  >
                    {selectedPaths.size === videos.length
                      ? "Clear selection"
                      : "Select all"}
                  </Button>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="rounded border-input"
                      checked={shuffleBatch}
                      onChange={(e) => setShuffleBatch(e.target.checked)}
                    />
                    <span>Shuffle batch order</span>
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    disabled={localBusy || selectedPaths.size === 0}
                    onClick={() => void enqueueBatch()}
                  >
                    {`Import selected${selectedPaths.size > 0 ? ` (${selectedPaths.size})` : ""}`}
                  </Button>
                </div>
                <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {videos.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No videos found.</p>
                  ) : (
                    videos.map((v) => {
                      const rel = selectedRoot
                        ? relativeUnderRoot(v.path, selectedRoot)
                        : v.name;
                      return (
                        <div
                          key={v.path}
                          className="hover:bg-muted/60 flex items-center justify-between gap-2 rounded px-2 py-1.5"
                        >
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              className="rounded border-input"
                              checked={selectedPaths.has(v.path)}
                              onChange={() => toggleSelectedPath(v.path)}
                            />
                            <span className="min-w-0 truncate text-sm" title={v.path}>
                              <span className="text-muted-foreground">{rel}</span>
                            </span>
                          </label>
                          <Button
                            type="button"
                            size="sm"
                            disabled={localBusy}
                            onClick={() => void enqueueLocal(v.path)}
                          >
                            Import
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
                {localErr ? (
                  <p className="text-sm text-destructive">{localErr}</p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {source === "upload" ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">Upload a video</CardTitle>
            <CardDescription>
              Stored under the run workspace; then open the run and start the pipeline.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label
              className={cn(
                "border-border bg-muted/30 hover:bg-muted/50 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center text-sm text-muted-foreground",
                uploadBusy && "pointer-events-none opacity-80",
              )}
            >
              <input
                type="file"
                accept="video/*,.mp4,.mkv,.webm,.mov"
                className="sr-only"
                disabled={uploadBusy}
                onChange={(e) => void onUploadFile(e.target.files?.[0] ?? null)}
              />
              {uploadBusy ? (
                <span className="flex flex-col items-center gap-2">
                  <Loader2
                    className="text-primary size-8 animate-spin"
                    aria-hidden
                  />
                  <span>
                    {uploadPhase === "preparing"
                      ? "Preparing upload…"
                      : uploadIndeterminate
                        ? "Uploading…"
                        : `Uploading… ${uploadPercent}%`}
                  </span>
                </span>
              ) : (
                "Click or drop a video file"
              )}
            </label>
            {uploadBusy ? (
              <div
                className="space-y-1.5"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={
                  uploadPhase === "uploading" && !uploadIndeterminate
                    ? uploadPercent
                    : undefined
                }
                aria-busy={true}
                aria-label={
                  uploadPhase === "preparing"
                    ? "Preparing upload"
                    : "Upload progress"
                }
              >
                <div className="bg-muted relative h-2 w-full overflow-hidden rounded-full">
                  {uploadPhase === "preparing" || uploadIndeterminate ? (
                    <div
                      className="animate-upload-indeterminate-slide absolute inset-y-0 left-0 h-full w-2/5 rounded-full bg-primary"
                      aria-hidden
                    />
                  ) : (
                    <div
                      className="bg-primary h-full rounded-full transition-[width] duration-150 ease-out"
                      style={{ width: `${uploadPercent}%` }}
                    />
                  )}
                </div>
              </div>
            ) : null}
            {uploadErr ? (
              <p className="text-sm text-destructive">{uploadErr}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {source === "link" ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">Video URL</CardTitle>
            <CardDescription>
              The server runs <code className="text-xs">yt-dlp</code>. Respect site terms and
              applicable law.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onYoutubeSubmit} className="space-y-3">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">URL</span>
                <input
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={ytUrl}
                  onChange={(e) => setYtUrl(e.target.value)}
                  placeholder="https://…"
                />
              </label>
              {ytErr ? (
                <p className="text-sm text-destructive">{ytErr}</p>
              ) : null}
              <Button type="submit" disabled={ytBusy || !ytUrl.trim()}>
                {ytBusy ? "Creating…" : "Create run & fetch"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {source === "gdrive" ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">Google Drive</CardTitle>
            <CardDescription>
              {gdriveStatus?.connected ? (
                "Open folders and import a video file."
              ) : (
                <>
                  Connect in{" "}
                  <Link
                    href="/settings"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Settings → Google Drive
                  </Link>
                  .
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!gdriveStatus?.hasCredentials ? (
              <p className="text-muted-foreground text-sm">
                Add OAuth client credentials, then connect your account.
              </p>
            ) : null}
            {gdriveStatus?.connected ? (
              <>
                <nav className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
                  {gdriveStack.map((crumb, i) => (
                    <span key={`${crumb.id}-${i}`} className="flex items-center gap-1">
                      {i > 0 ? <span>/</span> : null}
                      <button
                        type="button"
                        className={cn(
                          "hover:text-foreground underline-offset-4 hover:underline",
                          i === gdriveStack.length - 1 && "text-foreground font-medium",
                        )}
                        onClick={() => {
                          setGdriveStack((prev) => prev.slice(0, i + 1));
                        }}
                      >
                        {crumb.name}
                      </button>
                    </span>
                  ))}
                </nav>
                {gdriveBusy ? (
                  <Loader2 className="text-primary size-6 animate-spin" />
                ) : null}
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {gdriveFiles.map((f) => (
                    <div
                      key={f.id}
                      className="hover:bg-muted/60 flex items-center justify-between gap-2 rounded px-2 py-1.5"
                    >
                      <span className="min-w-0 truncate text-sm">{f.name}</span>
                      {f.kind === "folder" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setGdriveStack((prev) => [...prev, { id: f.id, name: f.name }])
                          }
                        >
                          Open
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          disabled={localBusy}
                          onClick={() => void importGdriveFile(f.id, f.name)}
                        >
                          Import
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : null}
            {gdriveErr ? (
              <p className="text-sm text-destructive">{gdriveErr}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {source === "s3" ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">S3 bucket</CardTitle>
            <CardDescription>
              {s3Configured ? (
                "Navigate prefixes and import a video object (copied into the run workspace)."
              ) : (
                <>
                  Configure{" "}
                  <Link
                    href="/settings"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Settings → S3
                  </Link>
                  .
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {s3Configured ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <input
                    className="min-w-[200px] flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={s3Prefix}
                    onChange={(e) => setS3Prefix(e.target.value)}
                    placeholder="prefix/"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void refreshS3Browse()}
                    disabled={s3Busy}
                  >
                    {s3Busy ? <Loader2 className="size-4 animate-spin" /> : "List"}
                  </Button>
                </div>
                {s3Browse ? (
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-xs">
                      Bucket: {s3Browse.bucket}
                    </p>
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                      {s3Browse.commonPrefixes.map((p) => (
                        <button
                          key={p}
                          type="button"
                          className="hover:bg-muted/60 block w-full truncate rounded px-2 py-1 text-left text-sm"
                          onClick={() => setS3Prefix(p)}
                        >
                          📁 {p}
                        </button>
                      ))}
                      {s3Browse.objects.map((o) => (
                        <div
                          key={o.key}
                          className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm"
                        >
                          <span className="min-w-0 truncate" title={o.key}>
                            {o.key.split("/").pop()}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            disabled={s3ImportBusy}
                            onClick={() => void importS3Key(o.key)}
                          >
                            Import
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
            {s3Err ? <p className="text-sm text-destructive">{s3Err}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {source === "catalog" ? <CatalogPanel compact /> : null}

      {source === "live" ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="font-heading text-lg">YouTube Live</CardTitle>
            <CardDescription>
              Automatic stream capture, rolling buffer, and clip scoring are documented in the
              roadmap. This build focuses on VOD imports and catalog indexing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/help"
              className="text-primary text-sm underline-offset-4 hover:underline"
            >
              Help &amp; docs
            </Link>
            {" · "}
            <a
              className="text-primary text-sm underline-offset-4 hover:underline"
              href="https://github.com/bintangtimurlangit/clipengine/blob/main/docs/youtube-live.md"
              target="_blank"
              rel="noreferrer"
            >
              YouTube Live roadmap
            </a>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-sm text-muted-foreground">
        When the run is <strong className="text-foreground">ready</strong>, open it and choose{" "}
        <strong className="text-foreground">Start pipeline</strong> (transcribe → plan → render).
        Pick workspace, S3, Drive, or YouTube output on that page. See{" "}
        <Link href="/help" className="text-primary underline-offset-4 hover:underline">
          Help
        </Link>{" "}
        for stages and artifacts.
      </p>
    </div>
  );
}
