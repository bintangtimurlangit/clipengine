import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { serverApiBase } from "@/lib/api";

async function getSetupStatus(): Promise<{ setupComplete: boolean }> {
  const base = serverApiBase();
  const res = await fetch(`${base}/api/setup/status`, { cache: "no-store" });
  if (!res.ok) {
    return { setupComplete: false };
  }
  return res.json();
}

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const s = await getSetupStatus();
  if (!s.setupComplete) {
    redirect("/setup");
  }

  return <AppShell>{children}</AppShell>;
}
