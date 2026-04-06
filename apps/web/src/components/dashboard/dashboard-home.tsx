import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LiveRunsTable } from "@/components/runs/live-runs-table";
import { fetchRunsList } from "@/lib/runs-api";

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
        <LiveRunsTable initialRuns={runs} limit={12} variant="home" />
      </CardContent>
    </Card>
  );
}
