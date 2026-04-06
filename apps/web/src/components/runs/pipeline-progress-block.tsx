"use client";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  isActiveRun,
  pipelinePhase,
  pipelineProgressValue,
  pipelineStatusMessage,
  type PipelinePhase,
} from "@/lib/pipeline-status";

const STEPS: { phase: PipelinePhase; label: string }[] = [
  { phase: "fetch", label: "Source" },
  { phase: "ingest", label: "Ingest" },
  { phase: "plan", label: "Plan" },
  { phase: "render", label: "Render" },
];

const PHASE_ORDER: PipelinePhase[] = ["fetch", "ingest", "plan", "render"];

function phaseIndex(phase: PipelinePhase): number {
  if (phase === "idle") return -1;
  return PHASE_ORDER.indexOf(phase);
}

type Props = {
  status: string;
  step: string | null;
  /** Shown when terminal (failed/expired) */
  errorDetail?: string | null;
  className?: string;
};

export function PipelineProgressBlock({ status, step, errorDetail, className }: Props) {
  const message = pipelineStatusMessage(status, step);
  const progress = pipelineProgressValue(status, step);
  const active = isActiveRun(status);
  const phase = pipelinePhase(status, step);
  const currentIdx = phaseIndex(phase);

  const showError =
    (status === "failed" || status === "expired") && errorDetail?.trim();

  const showBar = active || status === "ready" || status === "completed";

  return (
    <div
      className={cn("space-y-3", className)}
      aria-busy={active}
      aria-live={active ? "polite" : "off"}
    >
      <p className="text-sm text-muted-foreground">{message}</p>

      {showBar ? (
        <Progress value={progress} className="w-full min-w-[120px]" />
      ) : null}

      <ol className="flex flex-wrap gap-1 text-xs sm:gap-2">
        {STEPS.map(({ phase: p, label }) => {
          const idx = phaseIndex(p);
          const isCurrent = active && idx >= 0 && idx === currentIdx;
          const isPast = active && currentIdx > idx;
          const terminalOk = status === "completed" && idx >= 0;
          return (
            <li
              key={p}
              className={cn(
                "rounded-md px-2 py-1 transition-colors",
                isCurrent && "bg-primary/15 font-medium text-primary",
                isPast && "bg-muted/40 text-muted-foreground",
                !isCurrent &&
                  !isPast &&
                  !terminalOk &&
                  "bg-muted/60 text-muted-foreground",
                terminalOk && "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100",
              )}
            >
              {label}
            </li>
          );
        })}
      </ol>

      {showError ? (
        <p className="text-sm text-destructive whitespace-pre-wrap">{errorDetail}</p>
      ) : null}
    </div>
  );
}
