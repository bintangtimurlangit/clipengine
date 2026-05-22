'use client';

import { PresetEditor } from '@/components/presets/preset-editor';
import { useParams } from 'next/navigation';

export default function EditPresetPage() {
  const params = useParams<{ id: string }>();
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <header>
        <p className="text-sm font-medium text-muted-foreground">Presets</p>
        <h1 className="text-2xl font-semibold tracking-tight">Edit preset</h1>
      </header>
      <PresetEditor presetId={params.id} />
    </main>
  );
}
