"use client";

import { Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { publicApiUrl } from "@/lib/api";
import type { CatalogEntryRow, ImportRoot } from "@/types/run";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

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

export function CatalogPanel({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const [roots, setRoots] = useState<ImportRoot[]>([]);
  const [localRoot, setLocalRoot] = useState("");
  const [s3Prefix, setS3Prefix] = useState("");
  const [gdriveFolder, setGdriveFolder] = useState("root");
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncErr, setSyncErr] = useState<string | null>(null);
  const [entries, setEntries] = useState<CatalogEntryRow[]>([]);
  const [listBusy, setListBusy] = useState(false);
  const [runBusy, setRunBusy] = useState<string | null>(null);

  const loadRoots = useCallback(async () => {
    try {
      const data = await jsonFetch<{ roots: ImportRoot[] }>(
        publicApiUrl("/api/import/roots"),
      );
      setRoots(data.roots);
      setLocalRoot((prev) => prev || data.roots[0]?.path || "");
    } catch {
      /* ignore */
    }
  }, []);

  const loadEntries = useCallback(async () => {
    setListBusy(true);
    try {
      const data = await jsonFetch<{ entries: CatalogEntryRow[] }>(
        publicApiUrl("/api/catalog/entries?limit=500"),
      );
      setEntries(data.entries);
    } catch {
      setEntries([]);
    } finally {
      setListBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadRoots();
    void loadEntries();
  }, [loadRoots, loadEntries]);

  async function sync(kind: "local" | "s3" | "google_drive") {
    setSyncErr(null);
    setSyncMsg(null);
    setSyncBusy(true);
    try {
      const body: Record<string, unknown> = { kind };
      if (kind === "local") {
        if (!localRoot.trim()) throw new Error("Pick a directory root first.");
        body.root_path = localRoot.trim();
        body.recursive = true;
      } else if (kind === "s3") {
        body.s3_prefix = s3Prefix;
      } else {
        body.folder_id = gdriveFolder.trim() || "root";
      }
      const out = await jsonFetch<{ count?: number }>(
        publicApiUrl("/api/catalog/sync"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      setSyncMsg(`Indexed ${out.count ?? 0} item(s).`);
      await loadEntries();
    } catch (e) {
      setSyncErr(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncBusy(false);
    }
  }

  async function createRunFromEntry(id: string) {
    setRunBusy(id);
    try {
      const data = await jsonFetch<{ run: { id: string } }>(
        publicApiUrl("/api/runs/from-catalog"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ catalog_entry_id: id }),
        },
      );
      router.push(`/runs/${data.run.id}`);
    } catch {
      /* toast optional */
    } finally {
      setRunBusy(null);
    }
  }

  return (
    <div className={cn("space-y-6", compact && "space-y-4")}>
      {compact ? (
        <p className="text-muted-foreground text-sm">
          <Link
            href="/catalog"
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            Open full catalog page
          </Link>{" "}
          to sync sources and manage indexes.
        </p>
      ) : null}
      {!compact ? (
        <Card className="border-border/80 bg-card/50">
          <CardHeader>
            <CardTitle className="font-heading text-lg">Sync sources</CardTitle>
            <CardDescription>
              Re-scan to refresh the catalog. Local paths must be under{" "}
              <Link href="/settings" className="text-primary underline-offset-4 hover:underline">
                allowlisted storage
              </Link>{" "}
              (workspace,{" "}
              <code className="text-xs">CLIPENGINE_IMPORT_ROOTS</code>, or Settings → Local path).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex min-w-[200px] flex-1 flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Local root</span>
              <select
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={localRoot}
                onChange={(e) => setLocalRoot(e.target.value)}
              >
                {roots.map((r) => (
                  <option key={r.path} value={r.path} disabled={!r.exists}>
                    {r.path}
                    {!r.exists ? " (missing)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="secondary"
              disabled={syncBusy || !localRoot}
              onClick={() => void sync("local")}
            >
              {syncBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Sync local
            </Button>
            <label className="flex min-w-[160px] flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">S3 prefix</span>
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={s3Prefix}
                onChange={(e) => setS3Prefix(e.target.value)}
                placeholder="shows/MyShow/"
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              disabled={syncBusy}
              onClick={() => void sync("s3")}
            >
              Sync S3
            </Button>
            <label className="flex min-w-[140px] flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Drive folder id</span>
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={gdriveFolder}
                onChange={(e) => setGdriveFolder(e.target.value)}
                placeholder="root"
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              disabled={syncBusy}
              onClick={() => void sync("google_drive")}
            >
              Sync Drive
            </Button>
          </CardContent>
          {syncErr ? <p className="px-6 pb-4 text-sm text-destructive">{syncErr}</p> : null}
          {syncMsg ? (
            <p className="text-muted-foreground px-6 pb-4 text-sm">{syncMsg}</p>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="font-heading text-lg">Indexed entries</CardTitle>
            <CardDescription>
              {listBusy ? "Loading…" : `${entries.length} entries (latest sync).`}
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadEntries()}
            disabled={listBusy}
          >
            <RefreshCw className={cn("size-4", listBusy && "animate-spin")} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="max-h-80 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {entries.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No entries yet. Sync a source above or from Import.
              </p>
            ) : (
              entries.map((e) => (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded px-2 py-2 hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={e.displayName}>
                      {e.displayName}
                    </p>
                    <p className="text-muted-foreground truncate text-xs" title={e.relativePath ?? ""}>
                      {e.sourceKind}
                      {e.relativePath ? ` · ${e.relativePath}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={runBusy !== null}
                    onClick={() => void createRunFromEntry(e.id)}
                  >
                    {runBusy === e.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Create run"
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
