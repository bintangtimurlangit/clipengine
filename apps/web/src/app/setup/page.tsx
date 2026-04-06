import { redirect } from "next/navigation";

import { serverApiBase } from "@/lib/api";

import SetupForm from "./setup-form";

async function getSetupStatus(): Promise<{
  setupComplete: boolean;
  adminUsername: string | null;
}> {
  const base = serverApiBase();
  const res = await fetch(`${base}/api/setup/status`, { cache: "no-store" });
  if (!res.ok) {
    return { setupComplete: false, adminUsername: null };
  }
  return res.json();
}

export default async function SetupPage() {
  const s = await getSetupStatus();
  if (s.setupComplete) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <SetupForm />
    </div>
  );
}
