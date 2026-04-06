import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LibraryClipCard } from "@/components/library/library-clip-card";
import { LibraryRunSection } from "@/components/library/library-run-section";
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
  const blocksWithClips = blocks.filter((b) => b.clips.length > 0);
  const multiRun = blocksWithClips.length > 1;

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageHeader
        eyebrow="Media"
        title="Library"
        description={
          <p>
            Clips from completed runs (from <code className="text-xs">cut_plan.json</code>
            ). Download rendered files from each run&apos;s detail page.
            {multiRun ? (
              <> Collapse runs to scan the list; the newest stays open by default.</>
            ) : null}
          </p>
        }
      />

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
        <div className="space-y-6">
          {multiRun ? (
            <nav
              aria-label="Jump to run"
              className="rounded-xl border border-border bg-muted/20 px-3 py-3 sm:px-4"
            >
              <p className="text-xs font-medium text-muted-foreground">Jump to run</p>
              <ul className="mt-2 flex max-h-32 flex-wrap gap-x-4 gap-y-2 overflow-y-auto text-sm sm:max-h-none">
                {blocksWithClips.map((block) => {
                  const label =
                    block.run.title || block.run.sourceFilename || block.run.id;
                  return (
                    <li key={block.run.id} className="min-w-0 max-w-full">
                      <a
                        href={`#library-run-${block.run.id}`}
                        className="block truncate text-primary underline-offset-4 hover:underline"
                        title={label}
                      >
                        {label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}
          {blocksWithClips.map((block, index) => (
            <LibraryRunSection
              key={block.run.id}
              runId={block.run.id}
              runTitle={block.run.title || block.run.sourceFilename || block.run.id}
              createdAt={block.run.createdAt}
              clipCount={block.clips.length}
              defaultOpen={index === 0}
              editorialSummary={block.editorialSummary}
            >
              <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                {block.clips.map((c) => (
                  <LibraryClipCard key={c.id} runId={block.run.id} clip={c} compact />
                ))}
              </div>
            </LibraryRunSection>
          ))}
        </div>
      )}
    </div>
  );
}
