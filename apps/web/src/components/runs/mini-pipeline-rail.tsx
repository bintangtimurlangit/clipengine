import { miniPipelineDots } from "@/lib/pipeline-visual";
import { cn } from "@/lib/utils";
import type { PipelineRun } from "@/types/run";

export function MiniPipelineRail({ run }: { run: PipelineRun }) {
  const [a, b, c] = miniPipelineDots(run);
  const dot = (v: number, key: string) => {
    const cls =
      v === 2
        ? "bg-chart-2 shadow-[0_0_10px_-2px_oklch(0.55_0.12_160_/_50%)]"
        : v === 1
          ? "bg-primary animate-status-pulse shadow-[0_0_12px_-2px_oklch(0.55_0.14_200_/_45%)]"
          : v === 3
            ? "bg-destructive"
            : "bg-muted-foreground/25";
    return <span key={key} className={cn("h-2 w-2 rounded-full transition-colors", cls)} />;
  };
  return (
    <div
      className="flex items-center gap-1.5"
      title="Ingest → Plan → Render"
      aria-label="Pipeline: ingest, plan, render"
    >
      {dot(a, "i")}
      <span className="h-px w-3 bg-border/80" aria-hidden />
      {dot(b, "p")}
      <span className="h-px w-3 bg-border/80" aria-hidden />
      {dot(c, "r")}
    </div>
  );
}
