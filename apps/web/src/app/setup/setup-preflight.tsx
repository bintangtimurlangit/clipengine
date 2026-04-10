"use client";

import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { publicApiUrl } from "@/lib/api";

type LineState = "pending" | "running" | "ok" | "fail";

type PreflightLine = {
  id: "health" | "setup_status";
  title: string;
  description: string;
  state: LineState;
  detail?: string;
};

const initialLines: PreflightLine[] = [
  {
    id: "health",
    title: "API is online",
    description: "Reach the Clip Engine API (e.g. api container on port 8000).",
    state: "pending",
  },
  {
    id: "setup_status",
    title: "Setup endpoint ready",
    description: "Confirm the server accepts first-run setup.",
    state: "pending",
  },
];

function LineIcon({ state }: { state: LineState }) {
  if (state === "running") {
    return <Loader2 className="size-5 shrink-0 animate-spin text-zinc-500" aria-hidden />;
  }
  if (state === "ok") {
    return <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />;
  }
  if (state === "fail") {
    return <XCircle className="size-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />;
  }
  return <CircleDashed className="size-5 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden />;
}

export default function SetupPreflight({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<PreflightLine[]>(initialLines);
  const [passed, setPassed] = useState(false);

  const runChecks = useCallback(async () => {
    setPassed(false);
    setLines(
      initialLines.map((l) => ({
        ...l,
        state: "pending" as LineState,
        detail: undefined,
      })),
    );

    const setLine = (id: PreflightLine["id"], patch: Partial<PreflightLine>) => {
      setLines((prev) =>
        prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      );
    };

    setLine("health", { state: "running" });
    try {
      const res = await fetch(publicApiUrl("/health"), {
        cache: "no-store",
      });
      const text = await res.text();
      let body: { status?: string } = {};
      try {
        body = text ? (JSON.parse(text) as { status?: string }) : {};
      } catch {
        body = {};
      }
      if (!res.ok) {
        setLine("health", {
          state: "fail",
          detail: `HTTP ${res.status}`,
        });
        return;
      }
      if (body.status !== "ok") {
        setLine("health", {
          state: "fail",
          detail: "Unexpected health payload",
        });
        return;
      }
      setLine("health", { state: "ok" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLine("health", {
        state: "fail",
        detail: msg || "Network error",
      });
      return;
    }

    setLine("setup_status", { state: "running" });
    try {
      const res = await fetch(publicApiUrl("/api/setup/status"), {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        setupComplete?: boolean;
      };
      if (!res.ok) {
        setLine("setup_status", {
          state: "fail",
          detail: `HTTP ${res.status}`,
        });
        return;
      }
      if (data.setupComplete === true) {
        router.replace("/");
        router.refresh();
        return;
      }
      setLine("setup_status", { state: "ok" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLine("setup_status", {
        state: "fail",
        detail: msg || "Network error",
      });
      return;
    }

    setPassed(true);
  }, [router]);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  const failed = lines.some((l) => l.state === "fail");
  const running = lines.some((l) => l.state === "running");

  if (passed) {
    return <>{children}</>;
  }

  return (
    <div
      className="relative z-10 mx-auto flex w-full max-w-lg flex-col gap-6 rounded-xl border border-border bg-card/90 p-6 shadow-lg ring-1 ring-border/50 backdrop-blur-md"
      role="region"
      aria-label="Setup preflight checks"
    >
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
          Before you begin
        </p>
        <h1 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Preflight
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          We verify the API is reachable and ready. If you use Docker, start the stack
          (for example{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            docker compose up
          </code>
          ) and wait until the api service is healthy.
        </p>
      </div>

      <ul className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800" aria-live="polite">
        {lines.map((line) => (
          <li
            key={line.id}
            className="flex gap-3 rounded-lg border border-transparent px-1 py-0.5"
          >
            <LineIcon state={line.state} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                {line.title}
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {line.description}
              </p>
              {line.detail ? (
                <p className="mt-1 font-mono text-xs text-red-600 dark:text-red-400">
                  {line.detail}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {failed ? (
        <div
          className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-950 dark:text-amber-100"
          role="status"
        >
          <p className="font-medium">Checks did not pass</p>
          <p className="mt-1 text-xs opacity-90">
            Ensure the API process is running and that{" "}
            <code className="font-mono">API_INTERNAL_URL</code> (web → API) matches your
            deployment. Then retry.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={() => void runChecks()}
          disabled={running}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          {running ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-4" aria-hidden />
          )}
          Retry checks
        </button>
      </div>
    </div>
  );
}
