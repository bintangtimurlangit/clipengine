import { PageHeader } from "@/components/layout/page-header";
import { SubtitlesSettingsForm } from "@/components/settings/subtitles-settings-form";

export const dynamic = "force-dynamic";

export default function SubtitlesSettingsPage() {
  return (
    <div className="flex flex-col gap-3 md:gap-4">
      <PageHeader
        className="pb-4 md:pb-5"
        eyebrow="Instance"
        title="Subtitles"
        description={
          <p>
            Control burned-in subtitles for rendered clips. Changes apply to new pipeline runs.
          </p>
        }
      />
      <SubtitlesSettingsForm />
    </div>
  );
}
