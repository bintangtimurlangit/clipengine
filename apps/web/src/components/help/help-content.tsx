import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ExternalLink,
  FileAudio,
  Film,
  Sparkles,
  Workflow,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ARTIFACT_ROWS,
  DOCS_PIPELINE_URL,
  FEATURES,
  PIPELINE_STATUS,
  REQUIREMENTS,
  type FeatureBlock,
} from "@/lib/dashboard-content";
import { cn } from "@/lib/utils";

import { BindMountsTutorial } from "@/components/help/bind-mounts-tutorial";
import { QuickReferenceTabs } from "@/components/help/quick-reference-tabs";
import { PageHeader } from "@/components/layout/page-header";

const STEP_ICONS: Record<FeatureBlock["id"], LucideIcon> = {
  ingest: FileAudio,
  plan: Sparkles,
  render: Film,
  "run-all": Workflow,
};

const JUMP_LINKS = [
  { href: "#pipeline-steps", label: "Pipeline" },
  { href: "#artifacts", label: "Artifacts" },
  { href: "#bind-mounts", label: "Bind mounts" },
  { href: "#requirements", label: "Requirements" },
  { href: "#quick-reference", label: "Quick reference" },
] as const;

/** Renders `**bold**` segments as <strong>; plain text otherwise. */
function InlineBold({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        const inner = /^\*\*(.+)\*\*$/.exec(part);
        if (inner) {
          return (
            <strong key={i} className="font-semibold text-foreground">
              {inner[1]}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function HelpJumpNav() {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="On this page">
      {JUMP_LINKS.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

function HelpSectionTitle({
  id,
  title,
  description,
}: {
  id?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      <h2
        id={id}
        className="font-heading text-lg font-semibold tracking-tight text-foreground"
      >
        {title}
      </h2>
      {description ? (
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Help page: pipeline steps, artifacts, bind mounts, requirements, quick reference.
 */
export function HelpContent() {
  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <PageHeader
        eyebrow="Reference"
        title="Help & pipeline reference"
        description={
          <>
            <p className="leading-relaxed">{PIPELINE_STATUS}</p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Operator UI: </span>
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
            <div className="mt-6">
              <HelpJumpNav />
            </div>
          </>
        }
        actions={
          <a
            href={DOCS_PIPELINE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            <ExternalLink className="size-4 shrink-0 opacity-70" aria-hidden />
            docs/pipeline.md
          </a>
        }
      />

      <section
        id="pipeline-steps"
        className="scroll-mt-24 space-y-6"
        aria-labelledby="heading-pipeline-steps"
      >
        <HelpSectionTitle
          id="heading-pipeline-steps"
          title="Pipeline steps"
          description="Three stages—ingest, plan, render—or run them in one shot from a run in Ready state."
        />
        <div className="grid gap-4 md:grid-cols-2">
          {FEATURES.map((f, i) => {
            const Icon = STEP_ICONS[f.id];
            return (
              <Card
                key={f.id}
                size="sm"
                className={cn(
                  "shadow-sm ring-1 ring-border/60 transition-[box-shadow,ring-color] duration-200",
                  "hover:shadow-md hover:ring-primary/30",
                )}
              >
                <CardHeader className="gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground ring-1 ring-border/50"
                      aria-hidden
                    >
                      <Icon className="size-5" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <CardTitle className="text-base">{f.title}</CardTitle>
                        <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
                          {f.step}
                        </code>
                      </div>
                      <CardDescription className="leading-relaxed">
                        <InlineBold text={f.description} />
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Common options
                    </p>
                    <ul className="list-inside list-disc space-y-1.5 text-muted-foreground">
                      {f.flags.map((flag) => (
                        <li key={flag} className="leading-relaxed">
                          <InlineBold text={flag} />
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Outputs
                    </p>
                    <ul className="space-y-1.5 text-muted-foreground">
                      {f.outputs.map((o) => (
                        <li key={o} className="font-mono text-xs leading-relaxed">
                          <code className="break-all">{o}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <Separator className="opacity-60" />

      <section
        id="artifacts"
        className="scroll-mt-24 space-y-5"
        aria-labelledby="heading-artifacts"
      >
        <HelpSectionTitle
          id="heading-artifacts"
          title="Artifact tree"
          description="Typical files under a run workspace after a full pipeline (paths are relative to that folder)."
        />
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left">
                  <th className="px-4 py-3 font-medium">Path</th>
                  <th className="px-4 py-3 font-medium">Produced by</th>
                </tr>
              </thead>
              <tbody>
                {ARTIFACT_ROWS.map((row) => (
                  <tr
                    key={row.path}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/25"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-foreground">
                      {row.path}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.producedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <Separator className="opacity-60" />

      <BindMountsTutorial />

      <Separator className="opacity-60" />

      <section
        id="requirements"
        className="scroll-mt-24 space-y-5"
        aria-labelledby="heading-requirements"
      >
        <HelpSectionTitle
          id="heading-requirements"
          title="Requirements"
          description="What the API container and host typically need for ingest, plan, and render."
        />
        <ul className="space-y-3 rounded-xl border border-border bg-muted/20 p-4 md:p-5">
          {REQUIREMENTS.map((r) => (
            <li key={r} className="flex gap-3 text-sm text-muted-foreground">
              <span
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60"
                aria-hidden
              />
              <span className="leading-relaxed">
                <InlineBold text={r} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <Separator className="opacity-60" />

      <section
        id="quick-reference"
        className="scroll-mt-24 space-y-5"
        aria-labelledby="heading-quick-reference"
      >
        <HelpSectionTitle
          id="heading-quick-reference"
          title="Quick reference"
          description="Copy-friendly reminders for common dashboard flows. Full detail lives in the repo docs."
        />
        <p className="text-sm text-muted-foreground">
          Stages and artifacts:{" "}
          <a
            href={DOCS_PIPELINE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            docs/pipeline.md
          </a>{" "}
          on GitHub.
        </p>
        <div className="rounded-xl border border-border bg-muted/15 p-3 md:p-4">
          <QuickReferenceTabs />
        </div>
      </section>
    </div>
  );
}
