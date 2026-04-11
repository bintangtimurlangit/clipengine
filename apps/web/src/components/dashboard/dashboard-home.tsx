import Link from "next/link";

import { WorkflowOverview } from "@/components/dashboard/workflow-overview";
import { MiniPipelineRail } from "@/components/runs/mini-pipeline-rail";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchRunsList } from "@/lib/runs-api";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-muted text-foreground ring-1 ring-border/60",
    fetching: "bg-chart-4/15 text-chart-4 ring-1 ring-chart-4/25",
    ready: "bg-chart-1/12 text-chart-1 ring-1 ring-chart-1/20",
    running: "bg-primary/12 text-primary ring-1 ring-primary/25",
    completed: "bg-chart-2/15 text-chart-2 ring-1 ring-chart-2/25",
    failed: "bg-destructive/12 text-destructive ring-1 ring-destructive/25",
    cancelled: "bg-muted text-muted-foreground ring-1 ring-border/60",
    expired: "bg-muted text-muted-foreground ring-1 ring-border/60",
  };
  return map[status] ?? "bg-muted ring-1 ring-border/60";
}

export async function DashboardHome({ apiBase }: { apiBase: string }) {
  const runs = await fetchRunsList(apiBase, { limit: 12 });

  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <WorkflowOverview />

      <Card className="overflow-hidden border-border/70 shadow-sm ring-1 ring-border/30">
        <CardHeader className="border-b border-border/50 bg-muted/15 px-5 py-5 sm:px-6">
          <CardTitle className="font-heading text-lg">Recent jobs</CardTitle>
          <CardDescription className="text-pretty">
            Open a row for logs, cut plan, renders, and output settings. New jobs start from{" "}
            <Link href="/import" className="font-medium text-primary underline-offset-4 hover:underline">
              Import
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <div className="px-5 py-12 text-center sm:px-6">
              <p className="text-sm text-muted-foreground">
                No jobs yet.{" "}
                <Link
                  href="/import"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Add a source
                </Link>{" "}
                to create the first run.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20 text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Step</th>
                    <th className="px-4 py-3 font-medium">Pipeline</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border/40 transition-colors last:border-0 hover:bg-muted/15"
                    >
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize ${statusBadge(r.status)}`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-muted-foreground">
                        {r.step ?? "—"}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <MiniPipelineRail run={r} />
                      </td>
                      <td className="px-4 py-3 align-top">{r.sourceType}</td>
                      <td className="px-4 py-3 align-top">
                        <Link
                          href={`/runs/${r.id}`}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {r.title || r.sourceFilename || r.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 align-top text-muted-foreground tabular-nums">
                        {new Date(r.updatedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
