import Link from "next/link";

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
  };
  return map[status] ?? "bg-muted ring-1 ring-border/60";
}

export async function DashboardHome({ apiBase }: { apiBase: string }) {
  const runs = await fetchRunsList(apiBase, { limit: 12 });

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm ring-1 ring-border/40">
      <CardHeader className="border-b border-border/60 bg-muted/20">
        <CardTitle className="font-heading text-xl">Recent runs</CardTitle>
        <CardDescription className="text-pretty leading-relaxed">
          Status updates while jobs execute. Open a run for logs, artifacts, and
          downloads.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {runs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 bg-muted/15 px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No runs yet.{" "}
              <Link
                href="/import"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Create an import
              </Link>{" "}
              to add a video.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/25 text-left text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Step</th>
                  <th className="px-3 py-2.5 font-medium">Source</th>
                  <th className="px-3 py-2.5 font-medium">Title</th>
                  <th className="px-3 py-2.5 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/50 transition-colors last:border-0 hover:bg-muted/20"
                  >
                    <td className="px-3 py-2.5 align-top">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize ${statusBadge(r.status)}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-top text-muted-foreground">
                      {r.step ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 align-top">{r.sourceType}</td>
                    <td className="px-3 py-2.5 align-top">
                      <Link
                        href={`/runs/${r.id}`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {r.title || r.sourceFilename || r.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 align-top text-muted-foreground tabular-nums">
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
  );
}
