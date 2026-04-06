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
    pending: "bg-muted text-foreground",
    fetching: "bg-amber-500/15 text-amber-900 dark:text-amber-100",
    ready: "bg-sky-500/15 text-sky-900 dark:text-sky-100",
    running: "bg-primary/15 text-primary",
    completed: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100",
    failed: "bg-destructive/15 text-destructive",
  };
  return map[status] ?? "bg-muted";
}

export async function DashboardHome({ apiBase }: { apiBase: string }) {
  const runs = await fetchRunsList(apiBase, { limit: 12 });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent runs</CardTitle>
        <CardDescription>
          Status updates while jobs execute. Open a run for logs, artifacts, and
          downloads.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No runs yet.{" "}
            <Link href="/import" className="text-primary underline-offset-4 hover:underline">
              Create an import
            </Link>{" "}
            to add a video.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 pr-3 font-medium">Step</th>
                  <th className="pb-2 pr-3 font-medium">Source</th>
                  <th className="pb-2 pr-3 font-medium">Title</th>
                  <th className="pb-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 align-top">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${statusBadge(r.status)}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 align-top text-muted-foreground">
                      {r.step ?? "—"}
                    </td>
                    <td className="py-2 pr-3 align-top">{r.sourceType}</td>
                    <td className="py-2 pr-3 align-top">
                      <Link
                        href={`/runs/${r.id}`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {r.title || r.sourceFilename || r.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="py-2 align-top text-muted-foreground">
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
