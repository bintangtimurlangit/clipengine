import type { PipelineRun } from "@/types/run";

/** `extra.outputDestination.kind` when present. */
export function getOutputDestinationKind(run: PipelineRun): string | null {
  const ex = run.extra;
  if (!ex || typeof ex !== "object") return null;
  const od = (ex as Record<string, unknown>).outputDestination;
  if (!od || typeof od !== "object") return null;
  const k = (od as Record<string, unknown>).kind;
  return typeof k === "string" ? k : null;
}

export function formatOutputDestinationKind(kind: string): string {
  const labels: Record<string, string> = {
    google_drive: "Google Drive",
    youtube: "YouTube",
    s3: "S3",
    smb: "SMB",
    local_bind: "Local path",
    workspace: "Workspace",
  };
  return labels[kind] ?? kind.replace(/_/g, " ");
}
