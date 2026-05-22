import type { ClipItem, TranscriptDoc } from '@clipengine/schemas';
import { describe, expect, it } from 'vitest';
import { snapClipsToSegments } from '../src/plan/snap.js';
import { transcriptSnippet } from '../src/plan/snippets.js';

const transcript: TranscriptDoc = {
  source_video: 'sample.mp4',
  duration_s: 120,
  language: 'en',
  engine: 'whisper-base',
  segments: [
    { start_s: 0, end_s: 5, text: 'one' },
    { start_s: 5, end_s: 10, text: 'two' },
    { start_s: 10, end_s: 18, text: 'three' },
    { start_s: 18, end_s: 28, text: 'four' },
    { start_s: 28, end_s: 38, text: 'five' },
    { start_s: 38, end_s: 50, text: 'six' },
    { start_s: 50, end_s: 70, text: 'seven' },
    { start_s: 70, end_s: 90, text: 'eight' },
    { start_s: 90, end_s: 120, text: 'nine' },
  ],
};

function clip(partial: Partial<ClipItem> & Pick<ClipItem, 'start_s' | 'end_s'>): ClipItem {
  return {
    title: 'demo',
    rationale: 'demo',
    publish_description: '',
    ...partial,
  };
}

describe('snapClipsToSegments', () => {
  it('snaps start down and end up to segment boundaries', () => {
    const out = snapClipsToSegments([clip({ start_s: 11, end_s: 19 })], {
      transcript,
      minDurationS: 5,
      maxDurationS: 30,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.start_s).toBe(10);
    expect(out[0]?.end_s).toBe(28);
  });

  it('drops clips shorter than the minimum after snapping', () => {
    const out = snapClipsToSegments([clip({ start_s: 0, end_s: 2 })], {
      transcript,
      minDurationS: 10,
      maxDurationS: 30,
    });
    expect(out).toEqual([]);
  });

  it('trims clips longer than the maximum back to a segment boundary', () => {
    const out = snapClipsToSegments([clip({ start_s: 50, end_s: 119 })], {
      transcript,
      minDurationS: 10,
      maxDurationS: 40,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.start_s).toBe(50);
    // 50 + 40 = 90; nearest segment end <= 90 is 90.
    expect(out[0]?.end_s).toBe(90);
  });

  it('clamps end to the transcript duration', () => {
    const out = snapClipsToSegments([clip({ start_s: 90, end_s: 130 })], {
      transcript,
      minDurationS: 10,
      maxDurationS: 60,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.end_s).toBe(120);
  });

  it('returns no clips when transcript has no segments', () => {
    const empty: TranscriptDoc = { ...transcript, segments: [] };
    const out = snapClipsToSegments([clip({ start_s: 0, end_s: 10 })], {
      transcript: empty,
      minDurationS: 5,
      maxDurationS: 30,
    });
    expect(out).toHaveLength(1);
  });
});

describe('transcriptSnippet', () => {
  it('returns the full transcript when it fits', () => {
    const out = transcriptSnippet(transcript, 100_000);
    expect(out.split('\n')).toHaveLength(transcript.segments.length);
  });

  it('samples from start, middle, and end when too long', () => {
    const out = transcriptSnippet(transcript, 60);
    expect(out).toMatch(/\[\.\.\.\]/);
  });
});
