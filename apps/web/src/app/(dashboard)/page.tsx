import Link from "next/link";
import { Suspense } from "react";

import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";
import { serverApiBase } from "@/lib/api";
import { cn } from "@/lib/utils";

function DashboardRunsSkeleton() {
  return (
    <Card className="overflow-hidden border-border/80 shadow-sm ring-1 ring-border/40">
      <CardHeader className="border-b border-border/60 bg-muted/20">
        <CardTitle className="font-heading text-xl">Recent runs</CardTitle>
        <CardDescription className="text-pretty leading-relaxed">
          Loading recent runs…
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </CardContent>
    </Card>
  );
}

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
      <Suspense fallback={<DashboardRunsSkeleton />}>
        <DashboardHome apiBase={base} />
      </Suspense>
    </div>
  );
}
