import Link from "next/link";

import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { buttonVariants } from "@/components/ui/button-variants";
import { serverApiBase } from "@/lib/api";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const base = serverApiBase();
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Dashboard
          </h1>
          <p className="mt-1 text-muted-foreground">
            Recent pipeline runs and quick actions. Import media, then start ingest →
            plan → render.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/import" className={cn(buttonVariants())}>
            New import
          </Link>
          <Link href="/runs" className={cn(buttonVariants({ variant: "outline" }))}>
            All runs
          </Link>
        </div>
      </div>
      <DashboardHome apiBase={base} />
    </div>
  );
}
