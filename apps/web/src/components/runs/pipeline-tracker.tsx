"use client";

import { AudioLines, Check, CircleAlert, Film, Loader2, Sparkles } from "lucide-react";

import { computePipelineOverview, type PipelineStageVM } from "@/lib/pipeline-visual";
import type { PipelineRun } from "@/types/run";
import { cn } from "@/lib/utils";

function StageIcon({ stage }: { stage: PipelineStageVM }) {
  const cls = "h-4 w-4";
  if (stage.id === "ingest") return <AudioLines className={cls} aria-hidden />;
  if (stage.id === "plan") return <Sparkles className={cls} aria-hidden />;
  return <Film className={cls} aria-hidden />;
}

function StageNode({ stage }: { stage: PipelineStageVM }) {
  const ring =
    stage.kind === "active"
      ? "ring-2 ring-primary/80 shadow-[0_0_20px_-4px_oklch(0.55_0.14_200_/_45%)]"
      : stage.kind === "complete"
        ? "ring-1 ring-chart-2/50 bg-chart-2/10"
        : stage.kind === "error"
          ? "ring-1 ring-destructive/50 bg-destructive/10"
          : "ring-1 ring-border/80 bg-muted/30";

  const iconColor =
    stage.kind === "active"
      ? "text-primary"
      : stage.kind === "complete"
        ? "text-chart-2"
        : stage.kind === "error"
          ? "text-destructive"
          : "text-muted-foreground";

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all duration-300",
          ring,
        )}
        aria-current={stage.kind === "active" ? "step" : undefined}
      >
        {stage.kind === "complete" ? (
          <Check className="h-5 w-5 text-chart-2" strokeWidth={2.5} aria-hidden />
        ) : stage.kind === "error" ? (
          <CircleAlert className="h-5 w-5 text-destructive" aria-hidden />
        ) : stage.kind === "active" ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
        ) : (
          <span className={iconColor}>
            <StageIcon stage={stage} />
          </span>
        )}
      </div>
      <div className="w-full px-0.5 text-center">
        <p className="font-heading text-sm font-semibold leading-tight tracking-tight">
          {stage.label}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
          {stage.hint}
        </p>
      </div>
    </div>
  );
}

function StageConnector({ completed }: { completed: boolean }) {
  return (
    <div
      className="mt-[1.125rem] hidden min-w-[1.25rem] max-w-[3rem] flex-1 sm:block"
      aria-hidden
    >
      <div
        className={cn(
          "h-0.5 w-full rounded-full transition-colors duration-500",
          completed ? "bg-chart-2/55" : "bg-border/90",
        )}
      />
    </div>
  );
}

type Props = {
  run: PipelineRun;
  startingPipeline?: boolean;
  className?: string;
};

export function PipelineTracker({ run, startingPipeline, className }: Props) {
  const overview = computePipelineOverview(run, { startingPipeline });
  const { stages, headline, subline } = overview;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/25 shadow-sm",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.55] gradient-mesh"
        aria-hidden
      />
      <div className="relative px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
          <div className="min-w-0 space-y-1.5">
            <p className="font-heading text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {headline}
            </p>
            {subline ? (
              <p className="max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
                {subline}
              </p>
            ) : null}
          </div>
          <div className="flex w-full min-w-0 flex-col gap-3 lg:max-w-[min(100%,520px)] lg:flex-1">
            <div className="flex w-full items-start justify-between gap-0 sm:gap-1">
              {stages.map((stage, i) => (
                <div key={stage.id} className="contents">
                  <StageNode stage={stage} />
                  {i < stages.length - 1 ? (
                    <StageConnector completed={stage.kind === "complete"} />
                  ) : null}
                </div>
              ))}
            </div>
            {/* Mobile: linear progress between stages */}
            <div className="flex justify-center gap-2 sm:hidden" aria-hidden>
              {stages.slice(0, -1).map((stage) => (
                <div
                  key={stage.id}
                  className={cn(
                    "h-0.5 w-10 rounded-full",
                    stage.kind === "complete" ? "bg-chart-2/55" : "bg-border/90",
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        <p className="mt-6 border-t border-border/50 pt-4 text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground/90">Ingest</span> extracts audio and runs
          Whisper · <span className="font-medium text-foreground/90">Plan</span> builds the cut list
          (LLM or heuristic) · <span className="font-medium text-foreground/90">Render</span> encodes
          clips with FFmpeg.
        </p>
      </div>
    </div>
  );
}

export function pipelineProgressAriaLabel(
  run: PipelineRun,
  startingPipeline?: boolean,
): string {
  const o = computePipelineOverview(run, { startingPipeline });
  return [o.headline, o.subline].filter(Boolean).join(" — ");
}
