import { publicApiUrl } from "@/lib/api";
import { serverFetchJsonInit } from "@/lib/server-fetch";
import type {
  ArtifactRow,
  ClipItem,
  ImportRoot,
  PipelineRun,
} from "@/types/run";

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = (await res.json()) as { detail?: unknown };
      if (typeof j.detail === "string") detail = j.detail;
      else if (j.detail != null) detail = JSON.stringify(j.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchRunsList(
  baseUrl: string,
  opts?: { limit?: number; status?: string | null },
): Promise<PipelineRun[]> {
  const u = new URL(`${baseUrl}/api/runs`);
  if (opts?.limit != null) u.searchParams.set("limit", String(opts.limit));
  if (opts?.status) u.searchParams.set("status", opts.status);
  try {
    const res = await fetch(u.toString(), serverFetchJsonInit());
    const data = await parseJson<{ runs: PipelineRun[] }>(res);
    return data.runs;
  } catch {
    return [];
  }
}

export async function fetchRun(baseUrl: string, id: string): Promise<PipelineRun> {
  const res = await fetch(`${baseUrl}/api/runs/${id}`, serverFetchJsonInit());
  const data = await parseJson<{ run: PipelineRun }>(res);
  return data.run;
}

export async function fetchImportRoots(baseUrl: string): Promise<{
  roots: ImportRoot[];
  workspace: string;
}> {
  const res = await fetch(`${baseUrl}/api/import/roots`, serverFetchJsonInit());
  return parseJson(res);
}

export async function fetchVideosInDir(
  baseUrl: string,
  dirPath: string,
): Promise<{ directory: string; videos: { name: string; path: string }[] }> {
  const u = new URL(`${baseUrl}/api/import/videos`);
  u.searchParams.set("path", dirPath);
  const res = await fetch(u.toString(), serverFetchJsonInit());
  return parseJson(res);
}

export async function fetchArtifacts(
  baseUrl: string,
  runId: string,
): Promise<ArtifactRow[]> {
  const res = await fetch(`${baseUrl}/api/runs/${runId}/artifacts`, serverFetchJsonInit());
  const data = await parseJson<{ artifacts: ArtifactRow[] }>(res);
  return data.artifacts;
}

export async function fetchClips(
  baseUrl: string,
  runId: string,
): Promise<{
  clips: ClipItem[];
  longform: ClipItem[];
  shortform: ClipItem[];
  notes: string | null;
  editorialSummary: string | null;
}> {
  const res = await fetch(`${baseUrl}/api/runs/${runId}/clips`, serverFetchJsonInit());
  return parseJson(res);
}

/** Browser: download URL for an artifact (same-origin proxy or absolute API URL). */
export function artifactDownloadUrl(
  runId: string,
  relPath: string,
  opts?: { inline?: boolean },
): string {
  const base = publicApiUrl(`/api/runs/${runId}/artifacts/download`);
  const q = new URLSearchParams({ path: relPath });
  if (opts?.inline) q.set("inline", "true");
  return `${base}?${q}`;
}

/** True if the path is a container format the browser can usually play in <video>. */
export function isVideoArtifactPath(relPath: string): boolean {
  return /\.(mp4|webm|mov)$/i.test(relPath);
}

/** Browser: ZIP download for a rendered .mp4 plus sibling thumbnail (see API render-zip). */
export function renderedClipZipUrl(runId: string, mp4RelPath: string): string {
  const base = publicApiUrl(`/api/runs/${runId}/artifacts/render-zip`);
  const q = new URLSearchParams({ path: mp4RelPath });
  return `${base}?${q}`;
}

/** Plain-text LLM planning log (during ``plan`` when using the LLM). */
export function llmActivityUrl(runId: string): string {
  return publicApiUrl(`/api/runs/${runId}/llm-activity`);
}

/** JSON plan-step progress (phase, web search, timestamps). */
export function planActivityUrl(runId: string): string {
  return publicApiUrl(`/api/runs/${runId}/plan-activity`);
}

/** JSON render-step progress (current clip index, total, kind). */
export function renderActivityUrl(runId: string): string {
  return publicApiUrl(`/api/runs/${runId}/render-activity`);
}
