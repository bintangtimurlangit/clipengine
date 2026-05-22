import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

interface RegistrationStatus {
  open: boolean;
  admin_count: number;
}

interface OnboardingState {
  state: { step: 'transcription' | 'llm' | 'search' | 'completed' } | null;
  transcription_configured: boolean;
  llm_configured: boolean;
  search_configured: boolean;
}

interface SessionResponse {
  user?: { id: string };
}

async function fetchInternal<T>(
  path: string,
  h: Awaited<ReturnType<typeof headers>>,
): Promise<T | null> {
  const target = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:8000';
  try {
    const res = await fetch(`${target}${path}`, {
      cache: 'no-store',
      headers: { cookie: h.get('cookie') ?? '' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Front door routing.
 *
 * - No admin yet -> /register
 * - Admin exists, no session -> /login
 * - Session, onboarding incomplete -> the matching /onboarding/<step>
 * - Otherwise -> /dashboard
 */
export default async function HomePage() {
  const h = await headers();
  const status = await fetchInternal<RegistrationStatus>('/api/registration-status', h);

  if (status?.open) {
    redirect('/register');
  }

  const session = await fetchInternal<SessionResponse>('/api/auth/get-session', h);
  if (!session?.user) {
    redirect('/login');
  }

  const onboarding = await fetchInternal<OnboardingState>('/api/onboarding/state', h);
  if (!onboarding?.transcription_configured) {
    redirect('/onboarding/transcription');
  }
  if (!onboarding.llm_configured) {
    redirect('/onboarding/llm');
  }
  if (!onboarding.search_configured) {
    redirect('/onboarding/search');
  }
  if (onboarding.state?.step !== 'completed') {
    redirect('/onboarding/search');
  }

  redirect('/dashboard');
}
