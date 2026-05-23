/**
 * Onboarding routes.
 *
 * The web app forces a three-step gate before the dashboard:
 *   1. transcription (local | openai | openai_compatible)
 *   2. llm (openai | anthropic | openai_compatible)
 *   3. search (tavily | brave) — skippable with explicit warning
 *
 * Each step has a `Test connection` button on the form. Those
 * buttons call the routes here, which forward to the live probes
 * in @clipengine/llm-providers and @clipengine/search-providers.
 *
 * `GET /api/onboarding/state` reports the current step so the web
 * client knows where to land after a refresh.
 */

import { SettingsRepo } from '@clipengine/db';
import { testLlmConnection } from '@clipengine/llm-providers';
import {
  type LlmProfile,
  LlmProfileSchema,
  type OnboardingState,
  SETTING_KEYS,
  type SearchProfile,
  SearchProfileSchema,
  type SearchSettings,
  type TranscriptionSettings,
  TranscriptionSettingsSchema,
} from '@clipengine/schemas';
import { testSearchConnection } from '@clipengine/search-providers';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireUser } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { validateJson } from '../middleware/validate.js';
import type { AppBindings } from '../types.js';

const TestTranscriptionSchema = TranscriptionSettingsSchema;
const TestLlmSchema = LlmProfileSchema;
const TestSearchSchema = SearchProfileSchema;
const CompleteSchema = z.object({
  search_disabled: z.boolean().default(false),
});

export const onboardingRoutes = new Hono<AppBindings>();

onboardingRoutes.use('*', requireUser);

// Slow down accidental Test Connection spamming so the user doesn't
// burn through API credits in a runaway loop.
const testLimiter = rateLimit({ max: 30, windowMs: 60_000 });

onboardingRoutes.get('/state', async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'authentication required' });
  const repo = new SettingsRepo(c.get('db'));
  const onboarding = (await repo.get(user.id, SETTING_KEYS.onboarding)) ?? null;
  const transcription = (await repo.get(user.id, SETTING_KEYS.transcription)) ?? null;
  const llm = (await repo.get(user.id, SETTING_KEYS.llm)) ?? null;
  const search = (await repo.get(user.id, SETTING_KEYS.search)) ?? null;
  return c.json({
    state: onboarding satisfies OnboardingState | null,
    transcription_configured: transcription !== null,
    llm_configured: llm !== null,
    search_configured: search !== null,
  });
});

onboardingRoutes.post(
  '/test/transcription',
  testLimiter,
  validateJson(TestTranscriptionSchema),
  async (c) => {
    // Local backend has no external endpoint to ping (it would
    // download a multi-hundred-megabyte model); we treat its config
    // as always-valid here. The actual whisper.cpp run happens at
    // ingest time.
    const settings = c.get('parsedBody') as TranscriptionSettings;
    if (settings.backend === 'local') {
      return c.json({
        ok: true,
        detail: 'local whisper.cpp will download on first run',
        latency_ms: 0,
      });
    }
    const start = Date.now();
    try {
      const url = `${(settings.backend === 'openai_compatible' ? settings.base_url : 'https://api.openai.com/v1').replace(/\/+$/, '')}/models`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${settings.api_key}` },
      });
      const ok = res.status >= 200 && res.status < 400;
      return c.json({
        ok,
        detail: ok
          ? `${settings.backend} reachable (${res.status})`
          : `${settings.backend}: ${res.status} ${res.statusText}`,
        latency_ms: Date.now() - start,
      });
    } catch (err) {
      return c.json({
        ok: false,
        detail: err instanceof Error ? err.message : 'unknown error',
        latency_ms: Date.now() - start,
      });
    }
  },
);

onboardingRoutes.post('/test/llm', testLimiter, validateJson(TestLlmSchema), async (c) => {
  const profile = c.get('parsedBody') as LlmProfile;
  const result = await testLlmConnection(profile);
  return c.json(result);
});

onboardingRoutes.post('/test/search', testLimiter, validateJson(TestSearchSchema), async (c) => {
  const profile = c.get('parsedBody') as SearchProfile;
  const result = await testSearchConnection(profile);
  return c.json(result);
});

onboardingRoutes.post('/complete', validateJson(CompleteSchema), async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'authentication required' });
  const body = c.get('parsedBody') as z.infer<typeof CompleteSchema>;
  const repo = new SettingsRepo(c.get('db'));

  const transcription = await repo.get(user.id, SETTING_KEYS.transcription);
  const llm = await repo.get(user.id, SETTING_KEYS.llm);
  if (!transcription) {
    throw new HTTPException(400, { message: 'transcription is not configured' });
  }
  if (!llm) {
    throw new HTTPException(400, { message: 'LLM is not configured' });
  }

  if (body.search_disabled) {
    const disabled: SearchSettings = { disabled: true };
    await repo.set(user.id, SETTING_KEYS.search, disabled);
  } else {
    const existing = await repo.get(user.id, SETTING_KEYS.search);
    if (!existing) {
      throw new HTTPException(400, {
        message:
          'search is not configured. Configure Tavily or Brave, or set search_disabled=true to skip with a warning.',
      });
    }
  }

  const state: OnboardingState = {
    step: 'completed',
    completed_at: new Date().toISOString(),
  };
  await repo.set(user.id, SETTING_KEYS.onboarding, state);
  return c.json({ status: 'ok', state });
});
