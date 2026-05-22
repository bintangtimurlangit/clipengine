import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const STEPS = [
  { id: 'transcription', label: 'Transcription' },
  { id: 'llm', label: 'LLM' },
  { id: 'search', label: 'Web search' },
] as const;

export type OnboardingStepId = (typeof STEPS)[number]['id'];

export function OnboardingShell({
  current,
  title,
  description,
  children,
}: {
  current: OnboardingStepId;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">Onboarding</p>
        <h1 className="text-2xl font-semibold tracking-tight">Set up ClipEngine</h1>
        <ol className="flex flex-wrap gap-3 text-sm">
          {STEPS.map((step, index) => {
            const currentIndex = STEPS.findIndex((s) => s.id === current);
            const status =
              index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo';
            return (
              <li
                key={step.id}
                className={
                  status === 'done'
                    ? 'flex items-center gap-2 text-muted-foreground'
                    : status === 'current'
                      ? 'flex items-center gap-2 font-semibold text-foreground'
                      : 'flex items-center gap-2 text-muted-foreground'
                }
              >
                <span
                  className={
                    status === 'done'
                      ? 'flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground'
                      : status === 'current'
                        ? 'flex size-6 items-center justify-center rounded-full border border-primary text-xs text-primary'
                        : 'flex size-6 items-center justify-center rounded-full border text-xs'
                  }
                >
                  {index + 1}
                </span>
                <span>{step.label}</span>
              </li>
            );
          })}
        </ol>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>
    </main>
  );
}
