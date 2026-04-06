import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-muted text-foreground",
  fetching: "bg-amber-500/15 text-amber-900 dark:text-amber-100",
  ready: "bg-sky-500/15 text-sky-900 dark:text-sky-100",
  running: "bg-primary/15 text-primary",
  completed: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100",
  failed: "bg-destructive/15 text-destructive",
  expired: "bg-muted text-muted-foreground",
};

export function RunStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
        STATUS_CLASS[status] ?? "bg-muted text-foreground",
        className,
      )}
    >
      {status}
    </span>
  );
}
