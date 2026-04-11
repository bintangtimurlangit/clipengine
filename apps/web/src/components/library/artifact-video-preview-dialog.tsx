"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

import { artifactDownloadUrl } from "@/lib/runs-api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ArtifactVideoPreviewDialogProps = {
  runId: string;
  artifactPath: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * In-browser playback for a run artifact via the same download URL used for files,
 * with `inline=1` so the API serves video/* and Content-Disposition: inline.
 */
export function ArtifactVideoPreviewDialog({
  runId,
  artifactPath,
  title,
  open,
  onOpenChange,
}: ArtifactVideoPreviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const src = artifactDownloadUrl(runId, artifactPath, { inline: true });

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      const v = videoRef.current;
      if (v) {
        v.pause();
        v.removeAttribute("src");
        v.load();
      }
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        "w-[min(100vw-1.5rem,42rem)] max-w-[100vw] rounded-xl border border-border bg-card p-0 shadow-xl",
        "open:flex open:max-h-[min(90vh,720px)] open:flex-col",
        "[&::backdrop]:bg-black/55",
      )}
      onClose={() => onOpenChange(false)}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2.5 sm:px-4">
        <h2 className="min-w-0 flex-1 font-heading text-sm font-semibold leading-snug text-foreground sm:text-base">
          {title}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label="Close preview"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      <div className="min-h-0 flex-1 bg-black p-2 sm:p-3">
        <video
          ref={videoRef}
          key={artifactPath}
          className="mx-auto max-h-[min(70vh,640px)] w-full rounded-md"
          controls
          playsInline
          preload="metadata"
          src={src}
        />
      </div>
    </dialog>
  );
}
