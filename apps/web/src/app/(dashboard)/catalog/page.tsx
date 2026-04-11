import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { CatalogPanel } from "@/components/catalog/catalog-panel";

export default function CatalogPage() {
  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageHeader
        eyebrow="Sources"
        title="Media catalog"
        description={
          <p>
            Index videos from allowlisted folders, S3, or Google Drive for browsing and
            quick run creation. The pipeline still materializes a local copy when you start
            a run.{" "}
            <Link href="/import" className="text-primary underline-offset-4 hover:underline">
              Import
            </Link>{" "}
            has the same sync actions inline.
          </p>
        }
      />
      <CatalogPanel />
    </div>
  );
}
