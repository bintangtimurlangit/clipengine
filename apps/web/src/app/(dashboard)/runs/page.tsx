import Link from "next/link";

import { RunsFeed } from "@/components/runs/runs-feed";
import { fetchRunsList } from "@/lib/runs-api";
import { serverApiBase } from "@/lib/api";

export default async function RunsPage() {
  const runs = await fetchRunsList(serverApiBase(), { limit: 100 });

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/50 px-6 py-8 shadow-sm ring-1 ring-border/30 sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute inset-0 opacity-40 gradient-mesh" aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-noise opacity-[0.12]" aria-hidden />
        <div className="relative max-w-2xl space-y-3 animate-enter-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Pipeline
          </p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Runs
          </h1>
          <p className="text-pretty text-base leading-relaxed text-muted-foreground">
            Every job moves through{" "}
            <span className="font-medium text-foreground">ingest</span>,{" "}
            <span className="font-medium text-foreground">plan</span>, and{" "}
            <span className="font-medium text-foreground">render</span>. Open a run for live
            progress, planning logs, and downloads.
          </p>
          <p className="pt-1 text-sm">
            <Link
              href="/import"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              New import
            </Link>
            <span className="text-muted-foreground"> — add a source and queue a run.</span>
          </p>
        </div>
      </div>

      <RunsFeed runs={runs} />
    </div>
  );
}
