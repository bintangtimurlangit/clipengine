"use client";

import { useState } from "react";

import { publicApiUrl } from "@/lib/api";
import { artifactDownloadUrl } from "@/lib/runs-api";
import type { ClipItem } from "@/types/run";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { ConfirmAlertDialog } from "@/components/ui/confirm-alert-dialog";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = { runId: string; clip: ClipItem; compact?: boolean };

export function LibraryClipCard({ runId, clip, compact }: Props) {
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  async function deleteFile() {
    if (!clip.artifactPath) return;
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

  const dense = compact !== false;

  return (
    <Card
      size="sm"
      className={cn(
        "h-full gap-0 overflow-hidden py-0 shadow-sm ring-border/50",
        dense && "text-xs",
      )}
    >
      {clip.thumbnailPath ? (
        <div className="relative h-[4.25rem] shrink-0 overflow-hidden border-b border-border/70 sm:h-[4.75rem]">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed download URL from API */}
          <img
            src={artifactDownloadUrl(runId, clip.thumbnailPath)}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}
      <CardHeader
        className={cn(
          "px-2.5 pb-0 pt-2",
          dense && "gap-0.5",
          !clip.thumbnailPath && "pt-2.5",
        )}
      >
        <CardTitle
          className={cn(
            "line-clamp-2 text-[0.8125rem] font-semibold leading-tight sm:text-sm",
            dense && "min-h-[2.25rem]",
          )}
        >
          {clip.publishTitle ?? clip.title}
        </CardTitle>
        <CardDescription
          className={cn("text-[0.65rem] leading-tight text-muted-foreground sm:text-[0.7rem]")}
        >
          {clip.kind} · {clip.start_s.toFixed(1)}s – {clip.end_s.toFixed(1)}s
        </CardDescription>
      </CardHeader>
      <CardContent className={cn("space-y-2 px-2.5 pb-2.5 pt-1")}>
        <p
          className={cn(
            "text-[0.7rem] leading-snug text-muted-foreground sm:text-xs",
            dense && "line-clamp-2",
          )}
        >
          {clip.publishDescription ?? clip.description ?? clip.rationale}
        </p>
        {clip.artifactPath ? (
          <div className="flex flex-wrap gap-1.5">
            <ConfirmAlertDialog
              open={deleteDialogOpen}
              onOpenChange={setDeleteDialogOpen}
              title="Delete this file?"
              description="This removes the rendered file from disk on the server."
              confirmLabel="Delete file"
              cancelLabel="Keep"
              onConfirm={deleteFile}
            />
            <a
              href={artifactDownloadUrl(runId, clip.artifactPath)}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "h-7 flex-1 min-w-[4.5rem] px-2 text-[0.65rem] sm:flex-initial sm:text-xs",
              )}
            >
              Download
            </a>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy}
              className="h-7 flex-1 px-2 text-[0.65rem] sm:flex-initial sm:text-xs"
              onClick={() => setDeleteDialogOpen(true)}
            >
              {busy ? "…" : "Delete"}
            </Button>
          </div>
        ) : (
          <p className="text-[0.65rem] text-muted-foreground">No file yet.</p>
        )}
        {err ? <p className="text-[0.65rem] text-destructive">{err}</p> : null}
      </CardContent>
    </Card>
  );
}
