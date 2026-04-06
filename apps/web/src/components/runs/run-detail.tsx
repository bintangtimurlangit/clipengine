"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { publicApiUrl } from "@/lib/api";
import { artifactDownloadUrl } from "@/lib/runs-api";
import type { ArtifactRow, PipelineRun } from "@/types/run";

import { Button } from "@/components/ui/button";
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

type S3RunStatus = { configured: boolean };

type SmbRunStatus = { configured: boolean };

type OutputKind = "workspace" | "temp_12h" | "google_drive" | "s3" | "smb" | "local_bind";

export function RunDetail({ runId, initialRun }: Props) {
  const router = useRouter();
  const [run, setRun] = useState(initialRun);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [artErr, setArtErr] = useState<string | null>(null);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const [outputKind, setOutputKind] = useState<OutputKind>("workspace");
  const [gdriveFolderId, setGdriveFolderId] = useState("");
  const [gdriveStatus, setGdriveStatus] = useState<GDriveStatus | null>(null);
  const [s3Status, setS3Status] = useState<S3RunStatus | null>(null);
  const [smbStatus, setSmbStatus] = useState<SmbRunStatus | null>(null);
  const [s3Prefix, setS3Prefix] = useState("");
  const [smbSubpath, setSmbSubpath] = useState("");
  const [localBindPath, setLocalBindPath] = useState("");

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
    })();
  }, []);

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

  async function startPipeline() {
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
    try {
      const body: Record<string, unknown> = {
        output_destination: {
          kind: outputKind,
          ...(outputKind === "google_drive"
            ? { google_drive_folder_id: gdriveFolderId.trim() }
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
      setBusy(false);
    }
  }

  async function deleteRun() {
    if (!window.confirm("Delete this run and its workspace folder?")) return;
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

  const mp4Artifacts = artifacts.filter((a) => a.path.toLowerCase().endsWith(".mp4"));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/runs" className="hover:text-foreground">
              ← Runs
            </Link>
          </p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {run.title || run.sourceFilename || run.id}
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{run.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {run.status === "ready" ? (
            <Button type="button" disabled={busy} onClick={() => void startPipeline()}>
              Start pipeline
            </Button>
          ) : null}
          <Button
            type="button"
            variant="destructive"
            disabled={busy || run.status === "running"}
            onClick={() => void deleteRun()}
          >
            Delete run
          </Button>
        </div>
      </div>

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
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="out"
                  className="mt-1"
                  checked={outputKind === "temp_12h"}
                  onChange={() => setOutputKind("temp_12h")}
                />
                <span>
                  <span className="font-medium text-foreground">Temporary (12 hours)</span>
                  <span className="block text-muted-foreground">
                    After the pipeline completes, you have about 12 hours to download; then this
                    run&apos;s folder is removed automatically.
                  </span>
                </span>
              </label>
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
            {outputKind === "s3" ? (
              <div className="space-y-2">
                {s3Status && !s3Status.configured ? (
                  <p className="text-destructive">
                    S3 is not configured. Open{" "}
                    <Link href="/settings" className="underline">
                      Settings
                    </Link>{" "}
                    and add bucket credentials.
                  </p>
                ) : null}
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
                {smbStatus && !smbStatus.configured ? (
                  <p className="text-destructive">
                    SMB is not configured. Open{" "}
                    <Link href="/settings" className="underline">
                      Settings
                    </Link>{" "}
                    and add host, share, and credentials.
                  </p>
                ) : null}
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
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            {run.status === "fetching" && "Downloading source…"}
            {run.status === "running" && (run.step ? `Running: ${run.step}` : "Running…")}
            {run.status === "completed" && "Pipeline finished."}
            {run.status === "expired" && (run.error ?? "This run expired from temporary storage.")}
            {run.status === "failed" && (run.error ?? "Failed")}
          </CardDescription>
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
              <span className="text-muted-foreground">Whisper:</span> {run.whisperModel}
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
          {run.extra &&
          typeof run.extra === "object" &&
          run.extra !== null &&
          "retentionExpiresAt" in run.extra &&
          typeof (run.extra as { retentionExpiresAt?: unknown }).retentionExpiresAt ===
            "string" ? (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Temporary storage until: </span>
              {(run.extra as { retentionExpiresAt: string }).retentionExpiresAt}
            </p>
          ) : null}
          {run.error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">
              {run.error}
            </p>
          ) : null}
          {startErr ? <p className="text-destructive">{startErr}</p> : null}
          {deleteErr ? <p className="text-destructive">{deleteErr}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Artifacts</CardTitle>
          <CardDescription>
            Files under this run&apos;s workspace. MP4 renders appear under{" "}
            <code className="text-xs">rendered/</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {artErr ? <p className="text-sm text-destructive">{artErr}</p> : null}
          {artifacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No files yet.</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto font-mono text-xs">
              {artifacts.map((a) => (
                <li key={a.path} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 break-all">{a.path}</span>
                  <a
                    className="shrink-0 text-primary underline-offset-4 hover:underline"
                    href={artifactDownloadUrl(runId, a.path)}
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {mp4Artifacts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Quick downloads</CardTitle>
            <CardDescription>Rendered MP4 outputs</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {mp4Artifacts.map((a) => (
              <a
                key={a.path}
                href={artifactDownloadUrl(runId, a.path)}
                className="rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm hover:bg-muted"
              >
                {a.path}
              </a>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
