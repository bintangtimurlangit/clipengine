/**
 * AI SDK provider factory.
 *
 * ClipEngine has three real adapters:
 *   - OpenAI (`@ai-sdk/openai`)
 *   - Anthropic (`@ai-sdk/anthropic`)
 *   - OpenAI-compatible (`@ai-sdk/openai-compatible`) — covers the
 *     custom endpoint preset and Minimax (whose API speaks the
 *     OpenAI dialect).
 *
 * The settings UI exposes four buttons (`OpenAI`, `Anthropic`,
 * `Minimax`, `Custom`) but they collapse onto these three adapters
 * via the `preset` field on `LlmProfile`.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LlmProfile } from '@clipengine/schemas';
import type { LanguageModel } from 'ai';

/**
 * Build a {@link LanguageModel} from a saved {@link LlmProfile}.
 *
 * The same factory is used by the planner and by the
 * onboarding "Test connection" route, so behaviour stays consistent
 * between configuration time and run time.
 */
export function getLanguageModel(profile: LlmProfile): LanguageModel {
  switch (profile.provider) {
    case 'openai': {
      const provider = createOpenAI({
        apiKey: profile.api_key,
        ...(profile.base_url ? { baseURL: profile.base_url } : {}),
      });
      return provider(profile.model);
    }
    case 'anthropic': {
      const provider = createAnthropic({
        apiKey: profile.api_key,
        ...(profile.base_url ? { baseURL: profile.base_url } : {}),
      });
      return provider(profile.model);
    }
    case 'openai_compatible': {
      const provider = createOpenAICompatible({
        // The label shows up in errors; keep it close to what the
        // user picked in Settings.
        name: profile.preset === 'minimax' ? 'minimax' : 'custom',
        apiKey: profile.api_key,
        // Schema validation guarantees `base_url` is present for
        // the openai_compatible provider.
        baseURL: profile.base_url ?? '',
      });
      return provider(profile.model);
    }
  }
}
