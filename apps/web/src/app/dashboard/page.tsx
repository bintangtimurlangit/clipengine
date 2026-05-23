import Link from 'next/link';
import NewRunForm from '@/components/runs/new-run-form';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Dashboard</p>
          <h1 className="text-2xl font-semibold tracking-tight">Start clipping</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/runs">Runs</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/presets">Presets</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/logos">Logos</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/settings">Settings</Link>
          </Button>
        </div>
      </header>

      <NewRunForm />
    </main>
  );
}
