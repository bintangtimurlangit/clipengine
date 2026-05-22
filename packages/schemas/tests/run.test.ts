import { describe, expect, it } from 'vitest';
import { CreateRunInputSchema, RunSchema } from '../src/run.js';

const baseRun = {
  id: '00000000-0000-4000-8000-000000000001',
  user_id: 'admin',
  status: 'queued' as const,
  source: { type: 'youtube_vod' as const, url: 'https://youtu.be/abc12345xyz' },
  title: 'Test run',
  preset_longform_id: '00000000-0000-4000-8000-000000000010',
  preset_shortform_id: null,
  workspace_path: '/data/runs/abc',
  cancel_requested: false,
  error_code: null,
  error_message: null,
  created_at: '2026-01-01T00:00:00Z',
  started_at: null,
  finished_at: null,
};

describe('RunSchema', () => {
  it('parses a minimal queued run', () => {
    expect(RunSchema.parse(baseRun).status).toBe('queued');
  });

  it('rejects unknown statuses', () => {
    const r = RunSchema.safeParse({ ...baseRun, status: 'paused' });
    expect(r.success).toBe(false);
  });
});

describe('CreateRunInputSchema', () => {
  it('requires at least one preset', () => {
    const r = CreateRunInputSchema.safeParse({
      title: 'Test',
      source: baseRun.source,
      preset_longform_id: null,
      preset_shortform_id: null,
    });
    expect(r.success).toBe(false);
  });

  it('accepts a longform-only run', () => {
    const r = CreateRunInputSchema.safeParse({
      title: 'Test',
      source: baseRun.source,
      preset_longform_id: baseRun.preset_longform_id,
      preset_shortform_id: null,
    });
    expect(r.success).toBe(true);
  });

  it('rejects non-youtube urls for youtube_vod', () => {
    const r = CreateRunInputSchema.safeParse({
      title: 'Test',
      source: { type: 'youtube_vod', url: 'https://example.com/video' },
      preset_longform_id: baseRun.preset_longform_id,
      preset_shortform_id: null,
    });
    expect(r.success).toBe(false);
  });
});
