import { SettingsForm } from "@/components/settings/settings-form";

/** Avoid stale shell HTML if the route was cached during dev/prod switches. */
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Path, Storage destinations, LLM, and Search (Tavily) live in SQLite on this instance.
        </p>
      </div>
      <SettingsForm />
    </div>
  );
}
