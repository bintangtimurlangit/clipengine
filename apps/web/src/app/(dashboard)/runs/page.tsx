import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LiveRunsTable } from "@/components/runs/live-runs-table";
import { fetchRunsList } from "@/lib/runs-api";
import { serverApiBase } from "@/lib/api";

export default async function RunsPage() {
  const runs = await fetchRunsList(serverApiBase(), { limit: 100 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Runs</h1>
        <p className="mt-1 text-muted-foreground">
          All pipeline jobs, newest first.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Pipeline runs</CardTitle>
          <CardDescription>
            <Link href="/import" className="text-primary underline-offset-4 hover:underline">
              New import
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LiveRunsTable initialRuns={runs} limit={100} variant="full" />
        </CardContent>
      </Card>
    </div>
  );
}
