import { notFound } from "next/navigation";

import { RunDetail } from "@/components/runs/run-detail";
import { fetchRun } from "@/lib/runs-api";
import { serverApiBase } from "@/lib/api";
import type { PipelineRun } from "@/types/run";

type PageProps = { params: Promise<{ id: string }> };

export default async function RunDetailPage(ctx: PageProps) {
  const { id } = await ctx.params;
  let run: PipelineRun | undefined;
  try {
    run = await fetchRun(serverApiBase(), id);
  } catch {
    notFound();
  }
  if (!run) {
    notFound();
  }
  return <RunDetail runId={id} initialRun={run} />;
}
