import { ImportWizard } from "@/components/import/import-wizard";
import { PageHeader } from "@/components/layout/page-header";

export default function ImportPage() {
  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageHeader
        eyebrow="Sources"
        title="Import"
        description="Bring media in from a server folder, upload, URL, Google Drive, S3, or the catalog index. Then open the run and start the pipeline."
      />
      <ImportWizard />
    </div>
  );
}
