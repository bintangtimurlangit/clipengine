"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { clientFetchRunsList } from "@/lib/runs-api";
import { isActiveRun, pipelineStatusMessage } from "@/lib/pipeline-status";
import type { PipelineRun } from "@/types/run";

export function ProcessingBanner() {
  const [runs, setRuns] = useState<PipelineRun[]>([]);

  const poll = useCallback(async () => {
    try {
      const next = await clientFetchRunsList({ limit: 25 });
      setRuns(next);
    } catch {
      setRuns([]);
    }
  }, []);

  useEffect(() => {
    void poll();
  }, [poll]);

  const active = useMemo(() => runs.filter((r) => isActiveRun(r.status)), [runs]);

  useEffect(() => {
    const ms = active.length > 0 ? 4000 : 15000;
    const t = window.setInterval(() => {
      void poll();
    }, ms);
    return () => window.clearInterval(t);
  }, [poll, active.length]);

  if (active.length === 0) return null;

  const first = active[0];
  const label = pipelineStatusMessage(first.status, first.step);
  const suffix =
    active.length > 1 ? ` (+${active.length - 1} more)` : "";

  return (
    <div
      className="border-b border-border bg-muted/50 px-4 py-2 text-sm"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
        <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
        <span className="text-foreground">
          Processing:{" "}
          <span className="font-medium">{label}</span>
          {suffix}
        </span>
        <Link
          href={`/runs/${first.id}`}
          className="text-primary underline-offset-4 hover:underline"
        >
          View run
        </Link>
        <span className="text-muted-foreground">·</span>
        <Link href="/runs" className="text-primary underline-offset-4 hover:underline">
          All runs
        </Link>
      </div>
    </div>
  );
}
