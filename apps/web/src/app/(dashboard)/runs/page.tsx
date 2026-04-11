import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { RunsFeed } from "@/components/runs/runs-feed";
import { buttonVariants } from "@/components/ui/button-variants";
import { fetchRunsList } from "@/lib/runs-api";
import { serverApiBase } from "@/lib/api";
import { cn } from "@/lib/utils";

export default async function RunsPage() {
  const runs = await fetchRunsList(serverApiBase(), { limit: 100 });

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageHeader
        eyebrow="Activity"
        title="Runs"
        description={
          <p>
            Each job moves through <span className="font-medium text-foreground">ingest</span>{" "}
            (transcribe), <span className="font-medium text-foreground">plan</span> (LLM), and{" "}
            <span className="font-medium text-foreground">render</span>. Open a run for progress,
            logs, clips, and where files are delivered.
          </p>
        }
        actions={
          <Link href="/import" className={cn(buttonVariants({ size: "lg" }))}>
            New import
          </Link>
        }
      />

      <RunsFeed runs={runs} />
    </div>
  );
}
