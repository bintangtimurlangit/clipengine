"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Progress } from "@/components/ui/progress";
import { RunStatusBadge } from "@/components/runs/run-status-badge";
import { clientFetchRunsList } from "@/lib/runs-api";
import { isActiveRun, pipelineProgressValue } from "@/lib/pipeline-status";
import type { PipelineRun } from "@/types/run";

function RunRowMiniProgress({ status, step }: { status: string; step: string | null }) {
  const active = isActiveRun(status);
  const v = pipelineProgressValue(status, step);
  if (!active && status !== "ready" && status !== "completed") {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="w-24 max-w-[6rem] shrink-0 pt-1">
      <Progress value={v} className="h-1.5 w-full" />
    </div>
  );
}

type Variant = "home" | "full";

type Props = {
  initialRuns: PipelineRun[];
  limit: number;
  variant: Variant;
  /** When set, only list runs with this status (e.g. Library uses completed on server — omit polling filter). */
  statusFilter?: string | null;
};

export function LiveRunsTable({
  initialRuns,
  limit,
  variant,
  statusFilter,
}: Props) {
  const [runs, setRuns] = useState<PipelineRun[]>(initialRuns);

  const hasActive = useMemo(
    () => runs.some((r) => isActiveRun(r.status)),
    [runs],
  );

  const poll = useCallback(async () => {
    try {
      const next = await clientFetchRunsList({ limit, status: statusFilter ?? undefined });
      setRuns(next);
    } catch {
      /* ignore transient errors while polling */
    }
  }, [limit, statusFilter]);

  useEffect(() => {
    void poll();
  }, [poll]);

  useEffect(() => {
    const ms = hasActive ? 3500 : 12000;
    const t = window.setInterval(() => {
      void poll();
    }, ms);
    return () => window.clearInterval(t);
  }, [poll, hasActive]);

  if (runs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {variant === "home" ? (
          <>
            No runs yet.{" "}
            <Link href="/import" className="text-primary underline-offset-4 hover:underline">
              Create an import
            </Link>{" "}
            to add a video.
          </>
        ) : (
          "No runs yet."
        )}
      </p>
    );
  }

  const minW = variant === "home" ? "min-w-[640px]" : "min-w-[720px]";

  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${minW} border-collapse text-sm`}>
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="pb-2 pr-3 font-medium">Status</th>
            <th className="pb-2 pr-3 font-medium">Step</th>
            <th className="pb-2 pr-3 font-medium">Progress</th>
            <th className="pb-2 pr-3 font-medium">Source</th>
            {variant === "home" ? (
              <>
                <th className="pb-2 pr-3 font-medium">Title</th>
                <th className="pb-2 font-medium">Updated</th>
              </>
            ) : (
              <>
                <th className="pb-2 pr-3 font-medium">Run</th>
                <th className="pb-2 font-medium">Created</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="border-b border-border/60">
              <td className="py-2 pr-3 align-top">
                <RunStatusBadge status={r.status} />
              </td>
              <td className="py-2 pr-3 align-top text-muted-foreground">
                {r.step ?? "—"}
              </td>
              <td className="py-2 pr-3 align-top">
                <RunRowMiniProgress status={r.status} step={r.step} />
              </td>
              <td className="py-2 pr-3 align-top">{r.sourceType}</td>
              {variant === "home" ? (
                <>
                  <td className="py-2 pr-3 align-top">
                    <Link
                      href={`/runs/${r.id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {r.title || r.sourceFilename || r.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="py-2 align-top text-muted-foreground">
                    {new Date(r.updatedAt).toLocaleString()}
                  </td>
                </>
              ) : (
                <>
                  <td className="py-2 pr-3 align-top">
                    <Link
                      href={`/runs/${r.id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {r.title || r.sourceFilename || r.id}
                    </Link>
                  </td>
                  <td className="py-2 align-top text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
