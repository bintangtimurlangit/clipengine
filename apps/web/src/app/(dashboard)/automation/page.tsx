import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { serverApiBase } from "@/lib/api";

export default async function AutomationPage() {
  const base = serverApiBase();
  let message = "";
  let mode = "none";
  try {
    const res = await fetch(`${base}/api/automation`, { cache: "no-store" });
    if (res.ok) {
      const j = (await res.json()) as { mode?: string; message?: string };
      mode = j.mode ?? mode;
      message = j.message ?? "";
    }
  } catch {
    message = "Could not reach the API automation endpoint.";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Automation</h1>
        <p className="mt-1 text-muted-foreground">
          Folder watch, schedules, and webhooks will plug into the same import and run
          queue. This release exposes status only.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>Mode: {mode}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
          {message}
        </CardContent>
      </Card>
    </div>
  );
}
