import {
  type Anchor,
  type Dimensions,
  type LogoConfig,
  PRESET_SCHEMA_VERSION,
  type Preset,
  type SubtitleConfig,
  type TranscriptDoc,
} from '@clipengine/schemas';
import { describe, expect, it } from 'vitest';
import { buildGeometryFilter } from '../src/render/geometry.js';
import { slugify } from '../src/render/index.js';
import { buildLogoOverlay } from '../src/render/overlay.js';
import { buildAssSubtitles, formatAssTime, hexToAssColor } from '../src/render/subtitles.js';

const dims16x9: Dimensions = { width: 1920, height: 1080 };
const dims9x16: Dimensions = { width: 1080, height: 1920 };

const subtitleConfig: SubtitleConfig = {
  enabled: true,
  font_family: 'DejaVu Sans',
  font_size_px: 56,
  primary_color: '#FFFFFF',
  outline_color: '#000000',
  outline_width: 3,
  alignment: 'bottom_center',
  margin_v_px: 80,
  max_lines: 2,
  safe_area_px: 0,
};

const transcript: TranscriptDoc = {
  source_video: 'sample.mp4',
  duration_s: 60,
  language: 'en',
  engine: 'whisper-base',
  segments: [
    { start_s: 5, end_s: 8, text: 'First subtitle line.' },
    { start_s: 8, end_s: 12, text: 'Second subtitle line over here.' },
    { start_s: 12, end_s: 16, text: 'Third one trims at the cap.' },
    { start_s: 30, end_s: 35, text: 'Outside the clip window.' },
  ],
};

describe('buildGeometryFilter', () => {
  it('produces a fit-pad chain for horizontal targets', () => {
    const result = buildGeometryFilter('horizontal', dims16x9, 'vgeom');
    expect(result.outputLabel).toBe('vgeom');
    expect(result.filter).toContain('scale=w=1920:h=1080');
    expect(result.filter).toContain('force_original_aspect_ratio=decrease');
    expect(result.filter).toContain('pad=1920:1080');
    expect(result.filter).toContain('setsar=1');
  });

  it('produces a cover + crop chain for vertical targets', () => {
    const result = buildGeometryFilter('vertical', dims9x16, 'vgeom');
    expect(result.filter).toContain('force_original_aspect_ratio=increase');
    expect(result.filter).toContain('crop=1080:1920');
    expect(result.filter).not.toContain('pad=');
  });

  it('forces even target dimensions', () => {
    const result = buildGeometryFilter('horizontal', { width: 1921, height: 1081 }, 'v');
    expect(result.filter).toContain('scale=w=1920:h=1080');
  });
});

describe('buildLogoOverlay', () => {
  it('returns a no-op when no logo is configured', () => {
    const result = buildLogoOverlay('vgeom', 'vlogo', null);
    expect(result.filter).toBe('');
    expect(result.extraInputs).toEqual([]);
    expect(result.outputLabel).toBe('vgeom');
  });

  it('builds a scale + alpha + overlay chain at the chosen anchor', () => {
    const logoConfig: LogoConfig = {
      logo_id: '00000000-0000-4000-8000-000000000001',
      anchor: 'top_right',
      padding_px: 32,
      scale_pct: 12,
      opacity: 0.85,
    };
    const result = buildLogoOverlay('vgeom', 'vlogo', {
      path: '/data/logos/brand.png',
      config: logoConfig,
      dimensions: dims16x9,
    });
    expect(result.outputLabel).toBe('vlogo');
    expect(result.extraInputs).toEqual(['-i', '/data/logos/brand.png']);
    // 12% of 1920 = 230, rounded.
    expect(result.filter).toContain('scale=230:-1');
    expect(result.filter).toContain('colorchannelmixer=aa=0.850');
    expect(result.filter).toContain('overlay=x=W-w-32:y=32');
  });

  it('positions a bottom-center overlay correctly', () => {
    const logoConfig: LogoConfig = {
      logo_id: '00000000-0000-4000-8000-000000000002',
      anchor: 'bottom_center' as Anchor,
      padding_px: 24,
      scale_pct: 20,
      opacity: 1,
    };
    const result = buildLogoOverlay('vgeom', 'vlogo', {
      path: '/x.png',
      config: logoConfig,
      dimensions: dims9x16,
    });
    expect(result.filter).toContain('overlay=x=(W-w)/2:y=H-h-24');
  });
});

describe('hexToAssColor', () => {
  it('swaps red and blue and prefixes with &H00', () => {
    expect(hexToAssColor('#FFFFFF')).toBe('&H00FFFFFF');
    expect(hexToAssColor('#FF0000')).toBe('&H000000FF');
    expect(hexToAssColor('#00FF00')).toBe('&H0000FF00');
    expect(hexToAssColor('#0000FF')).toBe('&H00FF0000');
  });
});

describe('formatAssTime', () => {
  it('uses H:MM:SS.cs centiseconds', () => {
    expect(formatAssTime(0)).toBe('0:00:00.00');
    expect(formatAssTime(75.25)).toBe('0:01:15.25');
    expect(formatAssTime(3661.5)).toBe('1:01:01.50');
  });
});

describe('buildAssSubtitles', () => {
  it('writes script info, style, and dialogue cues', () => {
    const ass = buildAssSubtitles({
      transcript,
      config: subtitleConfig,
      dimensions: dims9x16,
      startOffsetS: 0,
      durationS: 30,
    });
    expect(ass).toContain('[Script Info]');
    expect(ass).toContain('[V4+ Styles]');
    expect(ass).toContain('Style: Default');
    expect(ass).toContain('[Events]');
    // 3 segments inside [0, 30]; the 4th starts at 30.
    const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
    expect(dialogues.length).toBe(3);
  });

  it('skips segments outside the clip window', () => {
    const ass = buildAssSubtitles({
      transcript,
      config: subtitleConfig,
      dimensions: dims9x16,
      startOffsetS: 0,
      durationS: 10, // only the first segment fits fully
    });
    const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
    // First segment is fully inside; second is clipped; third / fourth are outside.
    expect(dialogues.length).toBe(2);
  });

  it('rebases timestamps to start at zero', () => {
    const ass = buildAssSubtitles({
      transcript,
      config: subtitleConfig,
      dimensions: dims9x16,
      startOffsetS: 5,
      durationS: 5,
    });
    const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
    expect(dialogues[0]).toContain(',0:00:00.00,');
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify("Why You're Wrong (Part 1)")).toBe('why-you-re-wrong-part-1');
  });

  it('falls back to "clip" for empty input', () => {
    expect(slugify('')).toBe('clip');
    expect(slugify('!!!')).toBe('clip');
  });

  it('caps at ~40 characters', () => {
    expect(slugify('a'.repeat(80)).length).toBeLessThanOrEqual(40);
  });
});

// Smoke check that a fully-formed Preset still parses (cross-check
// with @clipengine/schemas) — render is allowed to assume PresetSchema.
describe('preset compatibility', () => {
  it('accepts a default-shaped preset', () => {
    const preset: Preset = {
      schema_version: PRESET_SCHEMA_VERSION,
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Longform 16:9',
      kind: 'longform',
      orientation: 'horizontal',
      dimensions: dims16x9,
      duration: { min_s: 180, max_s: 360 },
      encode: {
        fps: 30,
        crf: 20,
        preset: 'medium',
        audio_bitrate_kbps: 192,
      },
      logo: null,
      subtitles: subtitleConfig,
    };
    expect(preset.kind).toBe('longform');
  });
});
