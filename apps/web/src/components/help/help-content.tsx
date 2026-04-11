import Link from "next/link";
import { BookOpen, ExternalLink, FileText } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import {
  DOCS_BIND_MOUNTS_URL,
  DOCS_PIPELINE_URL,
  DOCS_SITE_URL,
} from "@/lib/dashboard-content";

function DocOutLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
    >
      <FileText className="size-4 shrink-0 opacity-70" aria-hidden />
      {label}
      <ExternalLink className="size-3.5 shrink-0 opacity-60" aria-hidden />
    </a>
  );
}

/**
 * Help hub: primary link to the documentation site, plus repo markdown references.
 */
export function HelpContent() {
  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <PageHeader
        eyebrow="Docs"
        title="Help"
        description={
          <>
            <p className="leading-relaxed">
              Guides for the pipeline, Docker, configuration, and bind mounts live on the
              documentation site. The links below stay available if you prefer the Markdown sources
              in the repository.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">In the app: </span>
              <Link className="text-primary hover:underline" href="/">
                Home
              </Link>
              <span className="text-muted-foreground"> · </span>
              <Link className="text-primary hover:underline" href="/import">
                Import
              </Link>
              <span className="text-muted-foreground"> · </span>
              <Link className="text-primary hover:underline" href="/runs">
                Runs
              </Link>
              <span className="text-muted-foreground"> · </span>
              <Link className="text-primary hover:underline" href="/library">
                Library
              </Link>
              <span className="text-muted-foreground"> · </span>
              <Link className="text-primary hover:underline" href="/automation">
                Automation
              </Link>
              <span className="text-muted-foreground"> · </span>
              <Link className="text-primary hover:underline" href="/settings">
                Settings
              </Link>
              .
            </p>
          </>
        }
        actions={
          <a
            href={DOCS_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            <BookOpen className="size-4 shrink-0" aria-hidden />
            Documentation
            <ExternalLink className="size-3.5 shrink-0 opacity-80" aria-hidden />
          </a>
        }
      />

      <Card className="shadow-sm ring-1 ring-border/60">
        <CardHeader className="gap-2">
          <CardTitle className="text-base">Repository reference</CardTitle>
          <CardDescription>
            Same content as on the docs site, as Markdown in the{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">docs/</code> folder.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <DocOutLink href={DOCS_PIPELINE_URL} label="docs/pipeline.md" />
          <DocOutLink href={DOCS_BIND_MOUNTS_URL} label="docs/bind-mounts.md" />
        </CardContent>
      </Card>
    </div>
  );
}
