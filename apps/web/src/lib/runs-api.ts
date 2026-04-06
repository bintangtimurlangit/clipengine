import { publicApiUrl } from "@/lib/api";
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
  const res = await fetch(u.toString(), { cache: "no-store" });
  const data = await parseJson<{ runs: PipelineRun[] }>(res);
  return data.runs;
}

export async function fetchRun(baseUrl: string, id: string): Promise<PipelineRun> {
  const res = await fetch(`${baseUrl}/api/runs/${id}`, { cache: "no-store" });
  const data = await parseJson<{ run: PipelineRun }>(res);
  return data.run;
}

export async function fetchImportRoots(baseUrl: string): Promise<{
  roots: ImportRoot[];
  workspace: string;
}> {
  const res = await fetch(`${baseUrl}/api/import/roots`, { cache: "no-store" });
  return parseJson(res);
}

export async function fetchVideosInDir(
  baseUrl: string,
  dirPath: string,
): Promise<{ directory: string; videos: { name: string; path: string }[] }> {
  const u = new URL(`${baseUrl}/api/import/videos`);
  u.searchParams.set("path", dirPath);
  const res = await fetch(u.toString(), { cache: "no-store" });
  return parseJson(res);
}

export async function fetchArtifacts(
  baseUrl: string,
  runId: string,
): Promise<ArtifactRow[]> {
  const res = await fetch(`${baseUrl}/api/runs/${runId}/artifacts`, {
    cache: "no-store",
  });
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
  const res = await fetch(`${baseUrl}/api/runs/${runId}/clips`, {
    cache: "no-store",
  });
  return parseJson(res);
}

/** Browser: download URL for an artifact (same-origin proxy or absolute API URL). */
export function artifactDownloadUrl(runId: string, relPath: string): string {
  const base = publicApiUrl(`/api/runs/${runId}/artifacts/download`);
  const q = new URLSearchParams({ path: relPath });
  return `${base}?${q}`;
}
