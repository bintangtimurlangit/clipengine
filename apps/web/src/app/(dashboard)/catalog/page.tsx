import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { CatalogPanel } from "@/components/catalog/catalog-panel";

export default function CatalogPage() {
  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageHeader
        eyebrow="Indexed media"
        title="Catalog"
        description={
          <p>
            Sync and browse videos from allowlisted folders, S3, or Google Drive. Starting a run
            still copies media into the job workspace. You can also open{" "}
            <Link href="/import" className="font-medium text-primary underline-offset-4 hover:underline">
              Import
            </Link>{" "}
            and use the Catalog source there.
          </p>
        }
      />
      <CatalogPanel />
    </div>
  );
}
