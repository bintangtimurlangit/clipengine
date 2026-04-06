"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { publicApiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type BindPathRow = { path: string; exists: boolean };

async function jsonFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, cache: "no-store" });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = (await res.json()) as { detail?: unknown };
      if (typeof j.detail === "string") detail = j.detail;
      else if (j.detail != null) detail = JSON.stringify(j.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function LocalBindSettingsCard() {
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [lines, setLines] = useState("");
  const [rows, setRows] = useState<BindPathRow[] | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const d = await jsonFetch<{ paths: BindPathRow[] }>(
        publicApiUrl("/api/storage/bind-paths"),
      );
      setRows(d.paths);
      setLines(d.paths.map((p) => p.path).join("\n"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load bind paths");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setErr(null);
    setSaved(null);
    const paths = lines
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    setPending(true);
    try {
      await jsonFetch(publicApiUrl("/api/storage/bind-paths"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });
      setSaved("Paths saved. They are allowlisted for imports and for “Local bind” output.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Local path (bind mount)</CardTitle>
        <CardDescription className="space-y-2">
          <span className="block">
            <strong>Can the Web UI edit Docker bind mounts?</strong> No. Bind mounts are defined by
            the Docker daemon from your Compose file (or <code className="text-xs">docker run -v</code>
            ). The app does not talk to Docker, so it cannot add or change host→container mounts by
            itself. Doing that from a browser would require mounting the Docker socket into the API
            container (high risk) and recreating containers anyway.
          </span>
          <span className="block">
            <strong>What this screen is for:</strong> after you mount a folder in Compose and restart
            the stack, register the <strong>container path</strong> here so Clip Engine allowlists it
            for local import and “Local bind” output. That is stored in SQLite, not in Docker.
          </span>
          <span className="block text-muted-foreground">
            Step-by-step:{" "}
            <Link
              href="/help#bind-mounts"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Help → Bind mounts &amp; local folders
            </Link>{" "}
            (same content as <code className="text-xs">docs/bind-mounts.md</code> in the repo).
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {err ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">
            {err}
          </p>
        ) : null}
        {saved ? (
          <p className="rounded-md border border-border bg-muted/50 p-2 text-foreground">{saved}</p>
        ) : null}
        <label className="flex flex-col gap-1.5">
          <span className="text-muted-foreground">
            One absolute directory per line (must exist when you save)
          </span>
          <textarea
            className="min-h-[120px] rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={lines}
            onChange={(e) => setLines(e.target.value)}
            placeholder={"/exports/clips\n/mnt/nas/renders"}
            spellCheck={false}
          />
        </label>
        {rows && rows.some((r) => !r.exists) ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Some saved paths are missing on disk from the container’s point of view—check your
            volume mounts.
          </p>
        ) : null}
        <Button type="button" disabled={pending} onClick={() => void save()}>
          {pending ? "Saving…" : "Save paths"}
        </Button>
      </CardContent>
    </Card>
  );
}
