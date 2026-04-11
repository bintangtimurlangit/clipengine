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
    <Card className="overflow-hidden border-border/70 shadow-sm ring-1 ring-border/30">
      <CardHeader className="border-b border-border/50 bg-muted/15">
        <CardTitle className="font-heading text-lg">Recent jobs</CardTitle>
        <CardDescription>Loading…</CardDescription>
      </CardHeader>
      <CardContent className="py-10">
        <p className="text-sm text-muted-foreground">Loading recent runs…</p>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const base = serverApiBase();
  return (
    <div className="flex flex-col gap-12 md:gap-14">
      <PageHeader
        eyebrow="Overview"
        title="Home"
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
