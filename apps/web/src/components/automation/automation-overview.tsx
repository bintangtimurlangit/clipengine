import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FolderSync,
  Link2,
  Radio,
  Settings,
  Sparkles,
  Video,
} from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { RunsFeed } from "@/components/runs/runs-feed";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PipelineRun } from "@/types/run";

export type AutomationYoutubeStatus = {
  hasCredentials?: boolean;
  connected?: boolean;
  uploadReady?: boolean;
  /** Total saved account slots (connected or not) */
  accountCount?: number;
  /** Accounts with a valid refresh token */
  connectedAccountCount?: number;
};

type Props = {
  mode: string;
  message: string;
  youtube?: AutomationYoutubeStatus;
  apiReachable: boolean;
  automatedRuns: PipelineRun[];
};

function StatusChip({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums tracking-tight",
        active
          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-border/80 bg-muted/40 text-muted-foreground",
      )}
    >
      {active ? (
        <CheckCircle2 className="size-3.5 shrink-0 opacity-90" aria-hidden />
      ) : (
        <span
          className="size-2 shrink-0 rounded-full bg-muted-foreground/35"
          aria-hidden
        />
      )}
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

function MessageBlock({ message }: { message: string }) {
  const lines = message
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  return (
    <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
      {lines.map((line) => (
        <li key={line} className="flex gap-2">
          <span
            className="mt-2 size-1 shrink-0 rounded-full bg-primary/50"
            aria-hidden
          />
          <span className="min-w-0">{line}</span>
        </li>
      ))}
    </ul>
  );
}

export function AutomationOverview({
  mode,
  message,
  youtube,
  apiReachable,
  automatedRuns,
}: Props) {
  const hasCreds = youtube?.hasCredentials === true;
  const connected = youtube?.connected === true;
  const ready = youtube?.uploadReady === true;
  const channelTotal = typeof youtube?.accountCount === "number" ? youtube.accountCount : null;
  const channelConnected =
    typeof youtube?.connectedAccountCount === "number" ? youtube.connectedAccountCount : null;

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageHeader
        eyebrow="Outputs & integrations"
        title="Automation"
        description="Wire cloud destinations once in Settings, then pick them per run. Background jobs (folder watch, schedules, webhooks) will use the same queue when they land."
        actions={
          <>
            <Link href="/settings" className={cn(buttonVariants({ size: "lg" }))}>
              <Settings className="size-4" aria-hidden />
              Settings
            </Link>
            <Link
              href="/runs"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              Open runs
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="animate-enter-3 relative overflow-hidden border-border/80 shadow-sm">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/45 to-transparent"
            aria-hidden
          />
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400">
                  <Video className="size-5" aria-hidden />
                </div>
                <div>
                  <CardTitle className="text-lg">YouTube</CardTitle>
                  <CardDescription className="mt-1">
                    Upload rendered clips after the pipeline. Connect multiple Google accounts in
                    Settings, then pick channels and distribution on each run.
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {!apiReachable ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Could not load integration status from the API.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5">
                    <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
                      OAuth client
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <StatusChip
                        active={hasCreds}
                        activeLabel="Saved"
                        inactiveLabel="Not set"
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5">
                    <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
                      Any account linked
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <StatusChip
                        active={connected}
                        activeLabel="Yes"
                        inactiveLabel="No"
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5">
                    <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
                      Channels
                    </p>
                    <div className="mt-2">
                      {channelConnected != null && channelTotal != null ? (
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                          {channelConnected} connected
                          {channelTotal > channelConnected ? (
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              · {channelTotal} total
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5">
                    <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
                      Upload
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <StatusChip
                        active={ready}
                        activeLabel="Ready"
                        inactiveLabel="Not ready"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Tip:</span> Storage → YouTube → save
                    credentials, then use <strong className="font-medium">Add account</strong> for each
                    channel. Quota is shared across channels (one API project).
                  </p>
                  <Link
                    href="/settings"
                    className={cn(
                      buttonVariants({ variant: "secondary", size: "sm" }),
                      "shrink-0 gap-1.5",
                    )}
                  >
                    <Link2 className="size-3.5" aria-hidden />
                    Connect YouTube
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="animate-enter-3 border-dashed border-border/80 bg-muted/10 shadow-none">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-background/80">
                <CalendarClock className="size-5 text-muted-foreground" aria-hidden />
              </div>
              <div>
                <CardTitle className="text-lg">Coming next</CardTitle>
                <CardDescription>
                  Same import and run queue — automation without extra clicks.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <FolderSync className="mt-0.5 size-4 shrink-0 text-primary/80" aria-hidden />
                <span>
                  <span className="font-medium text-foreground">Folder watch</span> — drop new media
                  into a watched directory to enqueue a run.
                </span>
              </li>
              <li className="flex gap-3">
                <Radio className="mt-0.5 size-4 shrink-0 text-primary/80" aria-hidden />
                <span>
                  <span className="font-medium text-foreground">Webhooks</span> — trigger runs from
                  n8n, CI, or your own services.
                </span>
              </li>
              <li className="flex gap-3">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary/80" aria-hidden />
                <span>
                  <span className="font-medium text-foreground">Schedules</span> — cron-style runs for
                  recurring pipelines.
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="animate-enter-3 border-border/70">
        <CardHeader>
          <CardTitle className="text-lg">Runs with output automation</CardTitle>
          <CardDescription>
            Pipeline jobs that send renders outside the workspace (YouTube, Drive, S3, SMB, or a
            bind-mounted folder). Set this when you click{" "}
            <span className="font-medium text-foreground">Start pipeline</span> on a run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RunsFeed
            runs={automatedRuns}
            showOutputDestination
            emptyMessage={
              <p className="text-sm text-muted-foreground">
                No automated outputs yet. Open a run, pick an external destination under{" "}
                <span className="font-medium text-foreground">Output destination</span>, then start
                the pipeline — or{" "}
                <Link
                  href="/runs"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  browse all runs
                </Link>
                .
              </p>
            }
          />
        </CardContent>
      </Card>

      <Card className="animate-enter-3 border-border/70">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <div>
            <CardTitle className="text-base">Integration mode</CardTitle>
            <CardDescription>Server-reported automation scope</CardDescription>
          </div>
          <span className="rounded-md border border-border/80 bg-muted/40 px-2.5 py-1 font-mono text-xs font-medium text-foreground">
            {mode}
          </span>
        </CardHeader>
        <CardContent className="space-y-4 border-t border-border/60 pt-4">
          {message ? <MessageBlock message={message} /> : null}
          {!message && apiReachable ? (
            <p className="text-sm text-muted-foreground">No extra status lines from the API.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
