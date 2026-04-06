import Link from "next/link";

import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { buttonVariants } from "@/components/ui/button-variants";
import { serverApiBase } from "@/lib/api";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const base = serverApiBase();
  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <div className="flex flex-col gap-6 border-b border-border/60 pb-8 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          <p className="animate-enter-1 font-mono text-[0.65rem] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Control room
          </p>
          <h1 className="animate-enter-2 mt-2 font-heading text-3xl font-semibold tracking-tight md:text-4xl">
            Dashboard
          </h1>
          <p className="animate-enter-3 mt-3 text-pretty text-muted-foreground leading-relaxed">
            Recent pipeline runs and quick actions. Import media, then start ingest →
            plan → render.
          </p>
        </div>
        <div className="animate-enter-3 flex flex-wrap gap-2">
          <Link href="/import" className={cn(buttonVariants({ size: "lg" }))}>
            New import
          </Link>
          <Link
            href="/runs"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
          >
            All runs
          </Link>
        </div>
      </div>
      <DashboardHome apiBase={base} />
    </div>
  );
}
