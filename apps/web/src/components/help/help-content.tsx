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
} from "@/lib/dashboard-content";

import { BindMountsTutorial } from "@/components/help/bind-mounts-tutorial";
import { QuickReferenceTabs } from "@/components/help/quick-reference-tabs";
import { PageHeader } from "@/components/layout/page-header";

/**
 * Help page: pipeline steps, artifacts, and quick reference.
 */
export function HelpContent() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Reference"
        title="Help & pipeline reference"
        description={PIPELINE_STATUS}
      />

      <section>
        <h2 className="mb-4 font-heading text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Pipeline steps
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {FEATURES.map((f) => (
            <Card key={f.id} size="sm">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-baseline gap-2">
                  {f.title}
                  <code className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                    {f.step}
                  </code>
                </CardTitle>
                <CardDescription>{f.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="mb-1 font-medium text-foreground">Common options</p>
                  <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                    {f.flags.map((flag) => (
                      <li key={flag}>{flag}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 font-medium text-foreground">Outputs</p>
                  <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                    {f.outputs.map((o) => (
                      <li key={o}>
                        <code className="font-mono text-xs">{o}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator />

      <section>
        <h2 className="mb-3 font-heading text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Artifact tree (typical full run output)
        </h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-3 py-2 font-medium">Path (under run workspace)</th>
                <th className="px-3 py-2 font-medium">Produced by</th>
              </tr>
            </thead>
            <tbody>
              {ARTIFACT_ROWS.map((row) => (
                <tr key={row.path} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{row.path}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.producedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Separator />

      <BindMountsTutorial />

      <Separator />

      <section>
        <h2 className="mb-3 font-heading text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Requirements
        </h2>
        <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
          {REQUIREMENTS.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>

      <Separator />

      <section>
        <h2 className="mb-3 font-heading text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Quick reference
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          See{" "}
          <a
            href={DOCS_PIPELINE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            docs/pipeline.md
          </a>{" "}
          for pipeline stages and artifacts.
        </p>
        <QuickReferenceTabs />
      </section>
    </div>
  );
}
