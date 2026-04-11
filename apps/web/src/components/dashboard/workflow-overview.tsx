import {
  Film,
  FolderInput,
  Radio,
  Share2,
  Sparkles,
  Subtitles,
} from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";
import { DOCS_SITE_URL } from "@/lib/dashboard-content";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    n: 1,
    title: "Source",
    body: "Folder (indexed), upload, YouTube / VOD URL, or YouTube Live (record, then pipeline).",
    icon: FolderInput,
  },
  {
    n: 2,
    title: "Transcribe & plan",
    body: "Whisper transcription, then the LLM proposes cuts and pacing.",
    icon: Subtitles,
  },
  {
    n: 3,
    title: "Clips",
    body: "Long-form and short-form outputs from the same plan.",
    icon: Film,
  },
  {
    n: 4,
    title: "Deliver",
    body: "Workspace (24h, remembers context for re-uploads), S3, Drive, or YouTube.",
    icon: Share2,
  },
] as const;

export function WorkflowOverview() {
  return (
    <section
      className="rounded-2xl border border-border/70 bg-gradient-to-b from-card/90 to-muted/15 p-6 shadow-sm ring-1 ring-border/35 md:p-8"
      aria-labelledby="workflow-heading"
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between md:gap-10">
        <div className="min-w-0 max-w-xl space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="size-5" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-[0.12em]">
              How it works
            </span>
          </div>
          <h2
            id="workflow-heading"
            className="font-heading text-xl font-semibold tracking-tight md:text-2xl"
          >
            One flow from video to published clips
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Pick a source, run the pipeline on a job, then choose where files go. Social
            publishing starts with YouTube; more channels will plug in here later.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 md:pt-1">
          <Link href="/import" className={cn(buttonVariants({ size: "lg" }))}>
            Start import
          </Link>
          <Link
            href="/settings"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
          >
            Destinations
          </Link>
        </div>
      </div>

      <ol className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((s) => {
          const Icon = s.icon;
          return (
            <li
              key={s.n}
              className="relative flex flex-col rounded-xl border border-border/60 bg-background/40 p-4 shadow-sm"
            >
              <span className="absolute right-3 top-3 font-mono text-[0.65rem] font-medium tabular-nums text-muted-foreground/80">
                {String(s.n).padStart(2, "0")}
              </span>
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                <Icon className="size-[1.15rem]" aria-hidden />
              </span>
              <p className="mt-3 font-heading text-sm font-semibold">{s.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          );
        })}
      </ol>

      <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
        <Radio className="mt-0.5 size-3.5 shrink-0 text-chart-4" aria-hidden />
        <span className="min-w-0">
          YouTube Live: record the stream on the server, stop when you have enough, then run the
          pipeline. Automatic clipping while live is not available yet. See the{" "}
          <a
            href={DOCS_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            documentation
          </a>{" "}
          for the current roadmap.
        </span>
      </p>
    </section>
  );
}
