import { PageHeader } from "@/components/layout/page-header";
import { SettingsForm } from "@/components/settings/settings-form";

/** Avoid stale shell HTML if the route was cached during dev/prod switches. */
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Path, Storage destinations, LLM, Transcription, Pipeline tuning, Web search (main + fallback providers), and optional Telegram notifications live in SQLite on this instance."
      />
      <SettingsForm />
    </div>
  );
}
