import { PageHeader } from "@/components/layout/page-header";
import { SettingsForm } from "@/components/settings/settings-form";

/** Avoid stale shell HTML if the route was cached during dev/prod switches. */
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <PageHeader
        eyebrow="Instance"
        title="Settings"
        description={
          <p>
            Everything is on one page — scroll through, or use &quot;On this page&quot; to jump.
            Save buttons live on each section; changes apply to new runs.
          </p>
        }
      />
      <SettingsForm />
    </div>
  );
}
