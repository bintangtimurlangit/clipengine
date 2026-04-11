import { PageHeader } from "@/components/layout/page-header";
import { SettingsForm } from "@/components/settings/settings-form";

/** Avoid stale shell HTML if the route was cached during dev/prod switches. */
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-3 md:gap-4">
      <PageHeader
        className="pb-4 md:pb-5"
        eyebrow="Instance"
        title="Settings"
        description={
          <p>
            Everything is on one page — scroll through, or use <strong>Sections</strong> to jump.
            Save buttons live on each section; changes apply to new runs.
          </p>
        }
      />
      <SettingsForm />
    </div>
  );
}
