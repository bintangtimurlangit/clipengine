/**
 * Web research stage.
 *
 * The planner asks the LLM for two short queries derived from the
 * transcript: an "identity" query (what is this video / who made it)
 * and a "highlights" query (what moments do people care about). We
 * run both through the search chain and pass the answers back to
 * the cut-plan prompt as grounding.
 *
 * Search is optional. If the user disabled it during onboarding (or
 * both providers fail), the planner falls back to transcript-only
 * planning and the resulting cut plan tends to be more conservative.
 */

import { runWithFallback } from '@clipengine/llm-providers';
import type { LlmSettings, SearchSettings, TranscriptDoc } from '@clipengine/schemas';
import {
  runSearchChain,
  type SearchChainAttempt,
  type SearchResponse,
} from '@clipengine/search-providers';
import { generateObject } from 'ai';
import { z } from 'zod';
import { transcriptSnippet } from './snippets.js';

const ResearchQueriesSchema = z.object({
  identity_query: z
    .string()
    .min(3)
    .max(180)
    .describe('Short web search query that would identify the video, show, or creator.'),
  highlights_query: z
    .string()
    .min(3)
    .max(180)
    .describe('Short web search query that would surface moments fans care about.'),
});
type ResearchQueries = z.infer<typeof ResearchQueriesSchema>;

export interface ResearchOptions {
  transcript: TranscriptDoc;
  /** Run title shown to the LLM as additional grounding. */
  title: string;
  llm: LlmSettings;
  search: SearchSettings;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface ResearchActivity {
  /** True when at least one search returned usable results. */
  used_search: boolean;
  identity_query: string;
  highlights_query: string;
  identity_attempts: SearchChainAttempt[];
  highlights_attempts: SearchChainAttempt[];
  identity_response: SearchResponse | null;
  highlights_response: SearchResponse | null;
}

export interface ResearchResult {
  /** Compact context string the cut-plan prompt embeds verbatim. */
  context: string;
  activity: ResearchActivity;
}

/**
 * Generate identity + highlights queries with the LLM, run them
 * through the search chain, and assemble a compact context string.
 *
 * Always succeeds; failures show up as empty attempts and an empty
 * `context` so the cut-plan prompt can still run.
 */
export async function runResearch(opts: ResearchOptions): Promise<ResearchResult> {
  const queries = await inferResearchQueries(opts);

  if (opts.search.disabled) {
    return {
      context: '',
      activity: {
        used_search: false,
        identity_query: queries.identity_query,
        highlights_query: queries.highlights_query,
        identity_attempts: [],
        highlights_attempts: [],
        identity_response: null,
        highlights_response: null,
      },
    };
  }

  const [identity, highlights] = await Promise.all([
    runSearchChain(opts.search, queries.identity_query, opts.signal, {
      fetchImpl: opts.fetchImpl,
    }),
    runSearchChain(opts.search, queries.highlights_query, opts.signal, {
      fetchImpl: opts.fetchImpl,
    }),
  ]);

  const context = formatResearchContext({
    identity: identity?.response ?? null,
    highlights: highlights?.response ?? null,
  });

  return {
    context,
    activity: {
      used_search: identity !== null || highlights !== null,
      identity_query: queries.identity_query,
      highlights_query: queries.highlights_query,
      identity_attempts: identity?.attempts ?? [],
      highlights_attempts: highlights?.attempts ?? [],
      identity_response: identity?.response ?? null,
      highlights_response: highlights?.response ?? null,
    },
  };
}

async function inferResearchQueries(opts: ResearchOptions): Promise<ResearchQueries> {
  const snippet = transcriptSnippet(opts.transcript, 1800);
  const { result } = await runWithFallback(opts.llm, async (model) => {
    const { object } = await generateObject({
      model,
      schema: ResearchQueriesSchema,
      prompt: `You are preparing context for a video editor.

The video's working title is "${opts.title}".

Below is a transcript snippet. Read it and produce TWO short web
search queries (3-12 words each). Return JSON.

1. identity_query: helps identify the video, podcast, show, episode,
   or creator. Mention proper nouns when present.
2. highlights_query: helps find moments that fans / commentary
   communities care about (memorable scenes, viral lines, etc.).

Transcript:
"""
${snippet}
"""`,
      abortSignal: opts.signal,
    });
    return object;
  });
  return result;
}

function formatResearchContext(input: {
  identity: SearchResponse | null;
  highlights: SearchResponse | null;
}): string {
  const parts: string[] = [];
  if (input.identity) {
    parts.push(formatBlock('Identity research', input.identity));
  }
  if (input.highlights) {
    parts.push(formatBlock('Highlights research', input.highlights));
  }
  return parts.join('\n\n');
}

function formatBlock(label: string, response: SearchResponse): string {
  const lines: string[] = [`### ${label} — query: ${response.query}`];
  if (response.answer) lines.push(response.answer);
  for (const r of response.results.slice(0, 5)) {
    const snippet = r.content.replace(/\s+/g, ' ').slice(0, 280).trim();
    if (!snippet) continue;
    lines.push(`- ${r.title} (${r.url}): ${snippet}`);
  }
  return lines.join('\n');
}
