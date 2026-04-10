import { redirect } from "next/navigation";

import { serverApiBase } from "@/lib/api";
import { RSC_SETUP_FETCH_MS, serverFetchJsonInit } from "@/lib/server-fetch";

import SetupForm from "./setup-form";
import SetupPreflight from "./setup-preflight";

async function getSetupStatus(): Promise<{
  setupComplete: boolean;
  adminUsername: string | null;
}> {
  const base = serverApiBase();
  try {
    const res = await fetch(
      `${base}/api/setup/status`,
      serverFetchJsonInit(RSC_SETUP_FETCH_MS),
    );
    if (!res.ok) {
      return { setupComplete: false, adminUsername: null };
    }
    return res.json();
  } catch {
    return { setupComplete: false, adminUsername: null };
  }
}

export default async function SetupPage() {
  const s = await getSetupStatus();
  if (s.setupComplete) {
    redirect("/");
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-start overflow-y-auto bg-background px-4 py-12">
      <div className="app-backdrop gradient-mesh opacity-90" aria-hidden />
      <div className="app-backdrop bg-noise opacity-[0.06] dark:opacity-[0.1]" aria-hidden />
      <div className="relative z-10 w-full">
        <SetupPreflight>
          <SetupForm />
        </SetupPreflight>
      </div>
    </div>
  );
}
