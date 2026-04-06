import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LibraryClipCard } from "@/components/library/library-clip-card";
import { fetchClips, fetchRunsList } from "@/lib/runs-api";
import { serverApiBase } from "@/lib/api";

export default async function LibraryPage() {
  const base = serverApiBase();
  const runs = await fetchRunsList(base, { limit: 40, status: "completed" });

  const blocks = await Promise.all(
    runs.map(async (r) => {
      try {
        const data = await fetchClips(base, r.id);
        return { run: r, ...data };
      } catch {
        return {
          run: r,
          clips: [],
          longform: [],
          shortform: [],
          notes: null as string | null,
          editorialSummary: null as string | null,
        };
      }
    }),
  );

  const totalClips = blocks.reduce((n, b) => n + b.clips.length, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Library</h1>
        <p className="mt-1 text-muted-foreground">
          Clips from completed runs (from <code className="text-xs">cut_plan.json</code>
          ). Download rendered files from each run&apos;s detail page.
        </p>
      </div>

      {totalClips === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No clips yet</CardTitle>
            <CardDescription>
              Finish a pipeline run, then clips planned by the LLM appear here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/import"
              className="text-primary underline-offset-4 hover:underline"
            >
              Start an import
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-10">
          {blocks.map((block) =>
            block.clips.length === 0 ? null : (
              <section key={block.run.id} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-heading text-lg font-semibold">
                    {block.run.title || block.run.sourceFilename || block.run.id}
                  </h2>
                  <Link
                    href={`/runs/${block.run.id}`}
                    className="text-sm text-primary underline-offset-4 hover:underline"
                  >
                    Open run
                  </Link>
                </div>
                {block.editorialSummary ? (
                  <p className="text-sm text-muted-foreground">{block.editorialSummary}</p>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {block.clips.map((c) => (
                    <LibraryClipCard key={c.id} runId={block.run.id} clip={c} />
                  ))}
                </div>
              </section>
            ),
          )}
        </div>
      )}
    </div>
  );
}
