"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  text: string;
  className?: string;
};

export function CopyBlock({ text, className }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-muted/40 sm:flex-row sm:items-stretch",
        className,
      )}
    >
      <pre className="min-w-0 flex-1 overflow-x-auto p-3 font-mono text-xs leading-relaxed sm:text-sm">
        {text}
      </pre>
      <div className="flex shrink-0 border-t p-2 sm:border-t-0 sm:border-l sm:p-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full sm:w-auto"
          onClick={copy}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
