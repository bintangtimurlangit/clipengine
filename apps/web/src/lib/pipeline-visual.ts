import type { PipelineRun } from "@/types/run";

export type PipelineStageId = "ingest" | "plan" | "render";

export type PipelineStageKind = "upcoming" | "active" | "complete" | "error";

export type PipelineStageVM = {
  id: PipelineStageId;
  label: string;
  hint: string;
  kind: PipelineStageKind;
};

export type PipelineOverview = {
  stages: PipelineStageVM[];
  headline: string;
  subline: string;
  /** Determinate bar width when not null; indeterminate when null and in progress */
  progressPercent: number | null;
  inProgress: boolean;
  terminalOk: boolean;
};

function normStep(step: string | null | undefined): PipelineStageId | "done" | null {
  if (step == null) return null;
  const s = step.toLowerCase().trim();
  if (s === "ingest") return "ingest";
  if (s === "plan") return "plan";
  if (s === "render") return "render";
  if (s === "done") return "done";
  return null;
}

function stageIndex(id: PipelineStageId): number {
  return id === "ingest" ? 0 : id === "plan" ? 1 : 2;
}

const STAGE_META: Record<
  PipelineStageId,
  { label: string; defaultHint: string }
> = {
  ingest: {
    label: "Ingest",
    defaultHint: "Transcribe & extract",
  },
  plan: {
    label: "Plan",
    defaultHint: "Cuts & editorial",
  },
  render: {
    label: "Render",
    defaultHint: "Encode clips",
  },
};

/**
 * Maps API run status + step to a 3-stage pipeline view (ingest → plan → render).
 */
export function computePipelineOverview(
  run: PipelineRun,
  opts?: { startingPipeline?: boolean },
): PipelineOverview {
  const starting = opts?.startingPipeline === true;
  const step = normStep(run.step);

  const base = (overrides: Partial<Record<PipelineStageId, PipelineStageKind>> = {}) => {
    const stages: PipelineStageVM[] = (["ingest", "plan", "render"] as const).map((id) => {
      const kind = overrides[id] ?? "upcoming";
      return {
        id,
        label: STAGE_META[id].label,
        hint: STAGE_META[id].defaultHint,
        kind,
      };
    });
    return stages;
  };

  if (run.status === "completed" || step === "done") {
    return {
      stages: base({ ingest: "complete", plan: "complete", render: "complete" }),
      headline: "Pipeline complete",
      subline: "All steps finished successfully.",
      progressPercent: 100,
      inProgress: false,
      terminalOk: true,
    };
  }

  if (run.status === "expired") {
    return {
      stages: base(),
      headline: "Run expired",
      subline: run.error ?? "This run is no longer available.",
      progressPercent: null,
      inProgress: false,
      terminalOk: false,
    };
  }

  if (run.status === "ready") {
    return {
      stages: base(),
      headline: "Ready to run",
      subline: "Choose output destination, then start the pipeline.",
      progressPercent: null,
      inProgress: false,
      terminalOk: false,
    };
  }

  if (starting) {
    return {
      stages: base({ ingest: "active" }),
      headline: "Starting pipeline",
      subline: "Handoff to the worker…",
      progressPercent: null,
      inProgress: true,
      terminalOk: false,
    };
  }

  if (run.status === "fetching") {
    const stages = base({ ingest: "active" });
    stages[0] = {
      ...stages[0],
      hint: "Fetching source media",
    };
    return {
      stages,
      headline: "Fetching source",
      subline: "Downloading or preparing your video…",
      progressPercent: null,
      inProgress: true,
      terminalOk: false,
    };
  }

  if (run.status === "pending") {
    const stages = base({ ingest: "active" });
    stages[0] = { ...stages[0], hint: "Queued" };
    return {
      stages,
      headline: "Preparing",
      subline: "Waiting to start…",
      progressPercent: null,
      inProgress: true,
      terminalOk: false,
    };
  }

  if (run.status === "failed" || run.status === "cancelled") {
    const fault: PipelineStageId =
      step === "ingest" || step === "plan" || step === "render"
        ? step
        : "render";
    const overrides: Partial<Record<PipelineStageId, PipelineStageKind>> = {};
    for (const id of ["ingest", "plan", "render"] as const) {
      if (stageIndex(id) < stageIndex(fault)) overrides[id] = "complete";
      else if (id === fault) overrides[id] = "error";
      else overrides[id] = "upcoming";
    }
    const isCancel = run.status === "cancelled";
    return {
      stages: base(overrides),
      headline: isCancel ? "Cancelled" : "Pipeline stopped",
      subline: run.error ?? (isCancel ? "Stopped by user." : "An error occurred."),
      progressPercent: null,
      inProgress: false,
      terminalOk: false,
    };
  }

  if (run.status === "running") {
    if (step === "ingest") {
      return {
        stages: base({ ingest: "active" }),
        headline: "Ingest running",
        subline: "Transcription and audio processing…",
        progressPercent: 33,
        inProgress: true,
        terminalOk: false,
      };
    }
    if (step === "plan") {
      return {
        stages: base({ ingest: "complete", plan: "active" }),
        headline: "Plan running",
        subline: "LLM or heuristic cut planning…",
        progressPercent: 66,
        inProgress: true,
        terminalOk: false,
      };
    }
    if (step === "render") {
      return {
        stages: base({ ingest: "complete", plan: "complete", render: "active" }),
        headline: "Render running",
        subline: "FFmpeg encode and packaging…",
        progressPercent: 90,
        inProgress: true,
        terminalOk: false,
      };
    }
    return {
      stages: base({ ingest: "active" }),
      headline: "Pipeline running",
      subline: run.step ? `Step: ${run.step}` : "Working…",
      progressPercent: null,
      inProgress: true,
      terminalOk: false,
    };
  }

  return {
    stages: base(),
    headline: run.status,
    subline: "",
    progressPercent: null,
    inProgress: false,
    terminalOk: false,
  };
}

/** Compact stage kind for list rows (0 = not started, 1 = active, 2 = done, 3 = error). */
export function miniPipelineDots(run: PipelineRun): [number, number, number] {
  const { stages } = computePipelineOverview(run);
  return stages.map((s) => {
    if (s.kind === "complete") return 2;
    if (s.kind === "active") return 1;
    if (s.kind === "error") return 3;
    return 0;
  }) as [number, number, number];
}
