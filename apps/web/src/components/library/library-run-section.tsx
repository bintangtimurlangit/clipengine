"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { cn } from "@/lib/utils";

function formatRunDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

function LibraryExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 360;
  if (!long) {
    return <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>;
  }
  return (
    <div>
      <p
        className={cn(
          "text-sm leading-relaxed text-muted-foreground",
          !expanded && "line-clamp-4",
        )}
      >
        {text}
      </p>
      <button
        type="button"
        className="mt-1.5 text-xs font-medium text-primary underline-offset-4 hover:underline"
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}

type Props = {
  runId: string;
  runTitle: string;
  createdAt: string;
  clipCount: number;
  defaultOpen: boolean;
  editorialSummary: string | null;
  children: React.ReactNode;
};

export function LibraryRunSection({
  runId,
  runTitle,
  createdAt,
  clipCount,
  defaultOpen,
  editorialSummary,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      id={`library-run-${runId}`}
      className="scroll-mt-20 overflow-hidden rounded-xl border border-border bg-card/40 ring-1 ring-foreground/5"
    >
      <div className="flex items-start gap-2 border-b border-border/80 px-3 py-3 sm:items-center sm:gap-3 sm:px-4">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 rounded-lg text-left outline-none ring-offset-background transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring sm:items-center sm:gap-3 sm:py-0.5 sm:pl-1 sm:pr-2"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={`library-run-body-${runId}`}
        >
          <ChevronDown
            className={cn(
              "mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 sm:mt-0",
              open ? "rotate-0" : "-rotate-90",
            )}
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="block font-heading text-base font-semibold leading-snug sm:text-lg">
              {runTitle}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {formatRunDate(createdAt)}
              {" · "}
              {clipCount} clip{clipCount !== 1 ? "s" : ""}
            </span>
          </span>
        </button>
        <Link
          href={`/runs/${runId}`}
          className="shrink-0 pt-0.5 text-sm text-primary underline-offset-4 hover:underline sm:pt-0"
          onClick={(e) => e.stopPropagation()}
        >
          Open run
        </Link>
      </div>
      {open ? (
        <div
          id={`library-run-body-${runId}`}
          className="space-y-4 px-3 pb-4 pt-3 sm:px-4"
        >
          {editorialSummary ? <LibraryExpandableText text={editorialSummary} /> : null}
          {children}
        </div>
      ) : null}
    </section>
  );
}
