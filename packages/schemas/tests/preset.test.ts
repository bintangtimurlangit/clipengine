import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LONGFORM_PRESET,
  DEFAULT_SHORTFORM_PRESET,
  migratePreset,
  PRESET_SCHEMA_VERSION,
  PresetInputSchema,
  PresetSchema,
} from '../src/preset.js';

const sampleId = '00000000-0000-4000-8000-000000000001';
const sampleLogoId = '00000000-0000-4000-8000-000000000002';

describe('PresetSchema', () => {
  it('accepts the default longform preset', () => {
    const parsed = PresetSchema.parse({
      ...DEFAULT_LONGFORM_PRESET,
      id: sampleId,
      schema_version: PRESET_SCHEMA_VERSION,
    });
    expect(parsed.kind).toBe('longform');
    expect(parsed.dimensions.width).toBe(1920);
  });

  it('accepts the default shortform preset', () => {
    const parsed = PresetSchema.parse({
      ...DEFAULT_SHORTFORM_PRESET,
      id: sampleId,
      schema_version: PRESET_SCHEMA_VERSION,
    });
    expect(parsed.kind).toBe('shortform');
    expect(parsed.subtitles.safe_area_px).toBeGreaterThan(0);
  });

  it('rejects odd dimensions (yuv420p constraint)', () => {
    const result = PresetInputSchema.safeParse({
      ...DEFAULT_LONGFORM_PRESET,
      dimensions: { width: 1921, height: 1080 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects min_s greater than max_s', () => {
    const result = PresetInputSchema.safeParse({
      ...DEFAULT_LONGFORM_PRESET,
      duration: { min_s: 600, max_s: 300 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects malformed hex colors', () => {
    const result = PresetInputSchema.safeParse({
      ...DEFAULT_LONGFORM_PRESET,
      subtitles: {
        ...DEFAULT_LONGFORM_PRESET.subtitles,
        primary_color: 'white',
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a logo with a uuid reference', () => {
    const parsed = PresetSchema.parse({
      ...DEFAULT_LONGFORM_PRESET,
      id: sampleId,
      schema_version: PRESET_SCHEMA_VERSION,
      logo: {
        logo_id: sampleLogoId,
        anchor: 'top_right',
        padding_px: 32,
        scale_pct: 12,
        opacity: 0.9,
      },
    });
    expect(parsed.logo).not.toBeNull();
    expect(parsed.logo?.anchor).toBe('top_right');
  });
});

describe('migratePreset', () => {
  it('returns a current-version preset unchanged', () => {
    const raw = {
      ...DEFAULT_LONGFORM_PRESET,
      id: sampleId,
      schema_version: PRESET_SCHEMA_VERSION,
    };
    expect(migratePreset(raw).id).toBe(sampleId);
  });

  it('throws on unknown schema versions', () => {
    expect(() =>
      migratePreset({
        ...DEFAULT_LONGFORM_PRESET,
        id: sampleId,
        schema_version: 99,
      }),
    ).toThrow(/unsupported schema_version/);
  });

  it('throws on non-objects', () => {
    expect(() => migratePreset(null)).toThrow();
    expect(() => migratePreset('hello')).toThrow();
  });
});
