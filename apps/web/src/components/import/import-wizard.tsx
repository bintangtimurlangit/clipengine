"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { publicApiUrl } from "@/lib/api";
import type { ImportRoot } from "@/types/run";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

export function ImportWizard() {
  const router = useRouter();
  const [roots, setRoots] = useState<ImportRoot[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [rootsErr, setRootsErr] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [whisperModel, setWhisperModel] = useState("base");

  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const [ytUrl, setYtUrl] = useState("");
  const [ytBusy, setYtBusy] = useState(false);
  const [ytErr, setYtErr] = useState<string | null>(null);

  const [selectedRoot, setSelectedRoot] = useState("");
  const [videos, setVideos] = useState<{ name: string; path: string }[]>([]);
  const [listErr, setListErr] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

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
      setRootsErr(e instanceof Error ? e.message : "Failed to load import roots");
    }
  }, []);

  useEffect(() => {
    void loadRoots();
  }, [loadRoots]);

  const refreshVideos = useCallback(async (dir: string) => {
    setListErr(null);
    try {
      const apiPath = publicApiUrl("/api/import/videos");
      const url = apiPath.startsWith("http")
        ? new URL(apiPath)
        : new URL(apiPath, window.location.origin);
      url.searchParams.set("path", dir);
      const data = await jsonFetch<{
        directory: string;
        videos: { name: string; path: string }[];
      }>(url.toString());
      setVideos(data.videos);
    } catch (e) {
      setListErr(e instanceof Error ? e.message : "List failed");
      setVideos([]);
    }
  }, []);

  useEffect(() => {
    if (!selectedRoot) return;
    void refreshVideos(selectedRoot);
  }, [selectedRoot, refreshVideos]);

  async function onUploadFile(file: File | null) {
    if (!file) return;
    setUploadErr(null);
    setUploadBusy(true);
    try {
      const create = await jsonFetch<{ run: { id: string } }>(
        publicApiUrl("/api/runs"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source_type: "upload",
            title: title || null,
            whisper_model: whisperModel,
          }),
        },
      );
      const fd = new FormData();
      fd.append("file", file);
      await jsonFetch(publicApiUrl(`/api/runs/${create.run.id}/upload`), {
        method: "POST",
        body: fd,
      });
      router.push(`/runs/${create.run.id}`);
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadBusy(false);
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
            whisper_model: whisperModel,
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
      const data = await jsonFetch<{ run: { id: string } }>(
        publicApiUrl("/api/runs"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source_type: "local_path",
            local_path: path,
            title: title || null,
            whisper_model: whisperModel,
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Run options</CardTitle>
          <CardDescription>
            Optional title and Whisper model apply to the next import you start.
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
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Whisper model</span>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={whisperModel}
              onChange={(e) => setWhisperModel(e.target.value)}
            >
              <option value="tiny">tiny</option>
              <option value="base">base</option>
              <option value="small">small</option>
              <option value="medium">medium</option>
              <option value="large-v3">large-v3</option>
            </select>
          </label>
        </CardContent>
      </Card>

      <Tabs defaultValue="upload">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="local">Local folder</TabsTrigger>
          <TabsTrigger value="youtube">YouTube URL</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Upload a video file</CardTitle>
              <CardDescription>
                File is stored under the workspace for this run, then you can start the
                pipeline from the run page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground hover:bg-muted/50">
                <input
                  type="file"
                  accept="video/*,.mp4,.mkv,.webm,.mov"
                  className="sr-only"
                  disabled={uploadBusy}
                  onChange={(e) => void onUploadFile(e.target.files?.[0] ?? null)}
                />
                {uploadBusy ? "Uploading…" : "Click or drop a video file"}
              </label>
              {uploadErr ? (
                <p className="text-sm text-destructive">{uploadErr}</p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="local" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Browse allowlisted directories</CardTitle>
              <CardDescription>
                Configure <code className="text-xs">CLIPENGINE_IMPORT_ROOTS</code> on
                the API (comma-separated paths). Workspace:{" "}
                <code className="text-xs">{workspace || "—"}</code>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {rootsErr ? (
                <p className="text-sm text-destructive">{rootsErr}</p>
              ) : null}
              {roots.length === 0 && !rootsErr ? (
                <p className="text-sm text-muted-foreground">
                  No import roots configured. Mount host folders into the container and set{" "}
                  <code className="text-xs">CLIPENGINE_IMPORT_ROOTS</code>, or use upload /
                  YouTube.
                </p>
              ) : (
                <>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted-foreground">Directory</span>
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
                  {listErr ? (
                    <p className="text-sm text-destructive">{listErr}</p>
                  ) : null}
                  <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                    {videos.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No videos found.</p>
                    ) : (
                      videos.map((v) => (
                        <div
                          key={v.path}
                          className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-muted/60"
                        >
                          <span className="min-w-0 truncate text-sm">{v.name}</span>
                          <Button
                            type="button"
                            size="sm"
                            disabled={localBusy}
                            onClick={() => void enqueueLocal(v.path)}
                          >
                            Import
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                  {localErr ? (
                    <p className="text-sm text-destructive">{localErr}</p>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="youtube" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Download from YouTube</CardTitle>
              <CardDescription>
                The server runs <code className="text-xs">yt-dlp</code> into your
                workspace. You must comply with YouTube&apos;s terms and applicable law.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onYoutubeSubmit} className="space-y-3">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Video URL</span>
                  <input
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={ytUrl}
                    onChange={(e) => setYtUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=…"
                  />
                </label>
                {ytErr ? <p className="text-sm text-destructive">{ytErr}</p> : null}
                <Button type="submit" disabled={ytBusy || !ytUrl.trim()}>
                  {ytBusy ? "Creating…" : "Create run & fetch"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-sm text-muted-foreground">
        After the source is <strong>ready</strong>, open the run and choose{" "}
        <strong>Start pipeline</strong> (ingest → plan → render).{" "}
        <Link href="/help" className="text-primary underline-offset-4 hover:underline">
          CLI reference
        </Link>
      </p>
    </div>
  );
}
