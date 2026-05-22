import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function SettingsPlaceholderPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm font-medium text-muted-foreground">Settings</p>
      <h1 className="text-2xl font-semibold tracking-tight">App settings</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Adjust transcription, LLM, search, and worker settings. Full UI lands next; for now, edit
        them directly through{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          PATCH /api/settings/&lt;key&gt;
        </code>
        .
      </p>
      <div className="mt-6 flex gap-2">
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
