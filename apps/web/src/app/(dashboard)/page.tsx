import Link from "next/link";

import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button-variants";
import { serverApiBase } from "@/lib/api";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const base = serverApiBase();
  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageHeader
        eyebrow="Control room"
        title="Dashboard"
        description="Recent pipeline runs and quick actions. Import media, then start ingest → plan → render."
        actions={
          <>
            <Link href="/import" className={cn(buttonVariants({ size: "lg" }))}>
              New import
            </Link>
            <Link
              href="/runs"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              All runs
            </Link>
          </>
        }
      />
      <DashboardHome apiBase={base} />
    </div>
  );
}
