import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  /** Short label above the title (section name). */
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/**
 * Top-of-page title block: light eyebrow, clear heading, readable description, optional actions.
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
        "flex flex-col gap-6 pb-8 md:flex-row md:items-start md:justify-between md:gap-8",
        className,
      )}
    >
      <div className="min-w-0 max-w-2xl space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-[2rem] md:leading-tight">
          {title}
        </h1>
        {description ? (
          <div className="text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 md:pt-7">{actions}</div>
      ) : null}
    </div>
  );
}
