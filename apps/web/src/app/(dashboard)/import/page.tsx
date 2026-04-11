import { ImportWizard } from "@/components/import/import-wizard";
import { PageHeader } from "@/components/layout/page-header";

export default function ImportPage() {
  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageHeader
        eyebrow="New job"
        title="Import"
        description={
          <p>
            Choose where the video comes from: an indexed folder, upload, a YouTube or other URL,
            Google Drive, S3, or the catalog. YouTube Live listens and clips automatically when that
            mode is available. After the run is ready, start transcribe → LLM plan → render, then set
            output to the workspace, S3, Drive, or YouTube.
          </p>
        }
      />
      <ImportWizard />
    </div>
  );
}
