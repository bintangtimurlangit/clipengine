import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function PresetsPlaceholderPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm font-medium text-muted-foreground">Presets</p>
      <h1 className="text-2xl font-semibold tracking-tight">Render presets</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Per-preset editing lands next. For now, default longform and shortform presets are seeded
        automatically.
      </p>
      <div className="mt-6 flex gap-2">
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
