import Link from "next/link";

import { ImportWizard } from "@/components/import/import-wizard";
import { PageHeader } from "@/components/layout/page-header";

export default function ImportPage() {
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <PageHeader
        eyebrow="New job"
        title="Add a video"
        description={
          <p>
            Three quick steps: pick a source, add optional labels for the AI, then finish the details
            for that source. Not sure where to start? Use <strong className="text-foreground">Upload</strong>{" "}
            or <strong className="text-foreground">YouTube / URL</strong>.{" "}
            <Link href="/help" className="text-primary underline-offset-4 hover:underline">
              Help
            </Link>{" "}
            explains the full pipeline.
          </p>
        }
      />
      <ImportWizard />
    </div>
  );
}
