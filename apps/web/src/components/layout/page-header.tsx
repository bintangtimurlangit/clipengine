import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/**
 * Shared top-of-page title block for dashboard routes: mono eyebrow, large heading,
 * muted description, optional action row, bottom border.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 border-b border-border/60 pb-8 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="max-w-2xl">
        <p className="animate-enter-1 font-mono text-[0.65rem] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="animate-enter-2 mt-2 font-heading text-3xl font-semibold tracking-tight md:text-4xl">
          {title}
        </h1>
        <div className="animate-enter-3 mt-3 text-pretty text-muted-foreground leading-relaxed">
          {description}
        </div>
      </div>
      {actions ? (
        <div className="animate-enter-3 flex flex-wrap gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
