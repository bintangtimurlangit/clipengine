"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { MiniPipelineRail } from "@/components/runs/mini-pipeline-rail";
import {
  formatOutputDestinationKind,
  getOutputDestinationKind,
} from "@/lib/output-destination";
import { cn } from "@/lib/utils";
import type { PipelineRun } from "@/types/run";

function formatRelativeUpdated(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diffMs = Date.now() - t;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function RelativeUpdated({ iso }: { iso: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="tabular-nums text-muted-foreground" title={new Date(iso).toLocaleString()}>
      {formatRelativeUpdated(iso)}
    </span>
  );
}

function statusPill(status: string) {
  const map: Record<string, string> = {
    pending: "bg-muted text-foreground ring-1 ring-border/60",
    fetching: "bg-chart-4/15 text-chart-4 ring-1 ring-chart-4/25",
    ready: "bg-chart-1/12 text-chart-1 ring-1 ring-chart-1/20",
    running: "bg-primary/12 text-primary ring-1 ring-primary/25",
    completed: "bg-chart-2/15 text-chart-2 ring-1 ring-chart-2/25",
    failed: "bg-destructive/12 text-destructive ring-1 ring-destructive/25",
    cancelled: "bg-muted text-muted-foreground ring-1 ring-border/60",
    expired: "bg-muted text-muted-foreground ring-1 ring-border/60",
  };
  return map[status] ?? "bg-muted ring-1 ring-border/60";
}

type RunsFeedProps = {
  runs: PipelineRun[];
  /** Show output destination (non-workspace) from run extra — for Automation page. */
  showOutputDestination?: boolean;
  emptyMessage?: ReactNode;
};

export function RunsFeed({
  runs,
  showOutputDestination = false,
  emptyMessage,
}: RunsFeedProps) {
  if (runs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 px-6 py-14 text-center">
        {emptyMessage ?? (
          <p className="text-sm text-muted-foreground">
            No runs yet.{" "}
            <Link href="/import" className="font-medium text-primary underline-offset-4 hover:underline">
              Import a video
            </Link>{" "}
            to create your first pipeline job.
          </p>
        )}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {runs.map((r, idx) => {
        const title = r.title || r.sourceFilename || r.id;
        const destKind = showOutputDestination ? getOutputDestinationKind(r) : null;
        return (
          <li
            key={r.id}
            className="animate-enter-1 rounded-2xl border border-border/70 bg-card/80 shadow-sm ring-1 ring-border/30 transition-colors hover:bg-muted/15 hover:ring-border/50"
            style={{ animationDelay: `${Math.min(idx, 8) * 45}ms` }}
          >
            <Link
              href={`/runs/${r.id}`}
              className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize",
                      statusPill(r.status),
                    )}
                  >
                    {r.status}
                  </span>
                  {destKind ? (
                    <span className="inline-flex rounded-md border border-primary/25 bg-primary/8 px-2 py-0.5 text-xs font-medium text-primary">
                      → {formatOutputDestinationKind(destKind)}
                    </span>
                  ) : null}
                  {r.step ? (
                    <span className="text-xs text-muted-foreground">
                      Step: <span className="font-medium text-foreground">{r.step}</span>
                    </span>
                  ) : null}
                </div>
                <p className="font-heading text-base font-semibold leading-snug tracking-tight text-foreground sm:text-lg">
                  {title}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{r.sourceType}</span>
                  <span className="hidden sm:inline" aria-hidden>
                    ·
                  </span>
                  <RelativeUpdated iso={r.updatedAt} />
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-4 border-t border-border/50 pt-3 sm:border-t-0 sm:pt-0">
                <MiniPipelineRail run={r} />
                <span className="text-xs font-medium text-primary sm:hidden">Open →</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
