import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { serverApiBase } from "@/lib/api";
import { RSC_SETUP_FETCH_MS, serverFetchJsonInit } from "@/lib/server-fetch";

async function getSetupStatus(): Promise<{ setupComplete: boolean }> {
  const base = serverApiBase();
  try {
    const res = await fetch(
      `${base}/api/setup/status`,
      serverFetchJsonInit(RSC_SETUP_FETCH_MS),
    );
    if (!res.ok) {
      return { setupComplete: false };
    }
    return res.json();
  } catch {
    return { setupComplete: false };
  }
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
