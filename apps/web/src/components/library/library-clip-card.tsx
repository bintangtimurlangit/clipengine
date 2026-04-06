"use client";

import { useState } from "react";

import { publicApiUrl } from "@/lib/api";
import { artifactDownloadUrl } from "@/lib/runs-api";
import type { ClipItem } from "@/types/run";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = { runId: string; clip: ClipItem };

export function LibraryClipCard({ runId, clip }: Props) {
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function deleteFile() {
    if (!clip.artifactPath) return;
    if (!window.confirm("Delete this rendered file from disk?")) return;
    setErr(null);
    setBusy(true);
    try {
      const u = new URL(publicApiUrl(`/api/runs/${runId}/artifacts`));
      u.searchParams.set("path", clip.artifactPath);
      const res = await fetch(u.toString(), { method: "DELETE" });
      if (!res.ok) {
        let detail = res.statusText;
        try {
          const j = (await res.json()) as { detail?: unknown };
          if (typeof j.detail === "string") detail = j.detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      setRemoved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  if (removed) {
    return null;
  }

  return (
    <Card size="sm">
      {clip.thumbnailPath ? (
        <div className="border-b border-border">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed download URL from API */}
          <img
            src={artifactDownloadUrl(runId, clip.thumbnailPath)}
            alt=""
            className="aspect-video w-full object-cover"
          />
        </div>
      ) : null}
      <CardHeader>
        <CardTitle className="text-base">{clip.title}</CardTitle>
        <CardDescription>
          {clip.kind} · {clip.start_s.toFixed(1)}s – {clip.end_s.toFixed(1)}s
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {clip.description ?? clip.rationale}
        </p>
        {clip.artifactPath ? (
          <div className="flex flex-wrap gap-2">
            <a
              href={artifactDownloadUrl(runId, clip.artifactPath)}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Download
            </a>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => void deleteFile()}
            >
              {busy ? "…" : "Delete file"}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No rendered file matched yet.</p>
        )}
        {err ? <p className="text-xs text-destructive">{err}</p> : null}
      </CardContent>
    </Card>
  );
}
