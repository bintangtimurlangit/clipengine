import { ImportWizard } from "@/components/import/import-wizard";

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Import</h1>
        <p className="mt-1 text-muted-foreground">
          Upload a file, pick from an allowlisted folder, or paste a YouTube link. Then
          start the pipeline from the run detail page.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
