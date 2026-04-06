/**
 * Derives UI copy and coarse progress from API `status` + `step`
 * (see clipengine_api pipeline_runner / runs_db).
 */

export function isActiveRun(status: string): boolean {
  return status === "fetching" || status === "running";
}

export function pipelineStatusMessage(status: string, step: string | null): string {
  if (status === "fetching") return "Downloading source…";
  if (status === "completed") return "Pipeline finished.";
  if (status === "failed") return "Failed";
  if (status === "expired") return "Expired from temporary storage.";
  if (status === "ready") return "Ready to start the pipeline.";
  if (status === "pending") return "Pending…";
  if (status === "running") {
    switch (step) {
      case "ingest":
        return "Transcribing and ingesting…";
      case "plan":
        return "Planning cuts…";
      case "render":
        return "Rendering clips…";
      case "done":
        return "Finalizing…";
      default:
        return "Running pipeline…";
    }
  }
  return status;
}

/**
 * Determinate completion 0–100, or `null` for indeterminate (e.g. fetching).
 */
export function pipelineProgressValue(status: string, step: string | null): number | null {
  if (status === "fetching") return null;
  if (status === "completed") return 100;
  if (status === "failed" || status === "expired") return null;
  if (status === "ready") return 0;
  if (status === "running") {
    switch (step) {
      case "ingest":
        return 25;
      case "plan":
        return 50;
      case "render":
        return 80;
      case "done":
        return 95;
      default:
        return null;
    }
  }
  return null;
}

export type PipelinePhase = "fetch" | "ingest" | "plan" | "render" | "idle";

/** Which phase is currently highlighted in the step strip. */
export function pipelinePhase(status: string, step: string | null): PipelinePhase {
  if (status === "fetching") return "fetch";
  if (status === "running") {
    switch (step) {
      case "ingest":
        return "ingest";
      case "plan":
        return "plan";
      case "render":
      case "done":
        return "render";
      default:
        return "idle";
    }
  }
  return "idle";
}
