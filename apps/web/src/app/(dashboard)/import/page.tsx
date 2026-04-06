import { ImportWizard } from "@/components/import/import-wizard";
import { PageHeader } from "@/components/layout/page-header";

export default function ImportPage() {
  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageHeader
        eyebrow="Sources"
        title="Import"
        description="Upload a file, pick from an allowlisted folder, or paste a YouTube link. Then start the pipeline from the run detail page."
      />
      <ImportWizard />
    </div>
  );
}
