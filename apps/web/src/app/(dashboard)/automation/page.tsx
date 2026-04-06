import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { serverApiBase } from "@/lib/api";

type AutomationApiResponse = {
  mode?: string;
  message?: string;
  youtube?: {
    hasCredentials?: boolean;
    connected?: boolean;
    uploadReady?: boolean;
  };
};

export default async function AutomationPage() {
  const base = serverApiBase();
  let message = "";
  let mode = "none";
  let youtube: AutomationApiResponse["youtube"];
  try {
    const res = await fetch(`${base}/api/automation`, { cache: "no-store" });
    if (res.ok) {
      const j = (await res.json()) as AutomationApiResponse;
      mode = j.mode ?? mode;
      message = j.message ?? "";
      youtube = j.youtube;
    }
  } catch {
    message = "Could not reach the API automation endpoint.";
  }

  const ytLine =
    youtube != null
      ? `Credentials saved: ${youtube.hasCredentials ? "yes" : "no"}. Connected: ${youtube.connected ? "yes" : "no"}. Ready to upload: ${youtube.uploadReady ? "yes" : "no"}.`
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Automation</h1>
        <p className="mt-1 text-muted-foreground">
          Connect external destinations under Settings, then choose them per run on the run detail
          page. Folder watch, schedules, and webhooks will plug into the same queue later.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>Mode: {mode}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">YouTube</p>
            <p className="mt-1">
              Auto-upload rendered MP4s when you select YouTube as the output destination for a run.
              OAuth: Settings → Storage → YouTube.
            </p>
            {ytLine ? <p className="mt-2">{ytLine}</p> : null}
          </div>
          <p className="whitespace-pre-wrap border-t border-border pt-4">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}
