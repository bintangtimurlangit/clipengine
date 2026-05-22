/**
 * Preset schema — controls how a clip is rendered.
 *
 * Each user owns multiple presets. Two are seeded on first run: a
 * long-form 16:9 preset and a short-form 9:16 preset. Users can
 * duplicate, edit, export, and re-import presets as JSON.
 *
 * Presets are versioned via {@link PresetSchemaVersion}. Old exports
 * keep loading because {@link migratePreset} forwards them through
 * each version step.
 */

import { z } from 'zod';

/** Bump when the preset shape changes incompatibly. */
export const PRESET_SCHEMA_VERSION = 1 as const;
export type PresetSchemaVersion = typeof PRESET_SCHEMA_VERSION;

/** Long-form (~3-6 min) or short-form (~30-80 s) clip target. */
export const ClipKindSchema = z.enum(['longform', 'shortform']);
export type ClipKind = z.infer<typeof ClipKindSchema>;

/** Frame orientation. Long-form is usually horizontal, short-form vertical. */
export const OrientationSchema = z.enum(['horizontal', 'vertical']);
export type Orientation = z.infer<typeof OrientationSchema>;

/** Logo / subtitle anchor relative to the rendered frame. */
export const AnchorSchema = z.enum([
  'top_left',
  'top_center',
  'top_right',
  'middle_left',
  'middle_center',
  'middle_right',
  'bottom_left',
  'bottom_center',
  'bottom_right',
]);
export type Anchor = z.infer<typeof AnchorSchema>;

/** Subset of x264 presets we expose; ordered slowest -> fastest visually. */
export const EncodePresetSchema = z.enum([
  'ultrafast',
  'superfast',
  'veryfast',
  'faster',
  'fast',
  'medium',
  'slow',
]);
export type EncodePreset = z.infer<typeof EncodePresetSchema>;

const HexColor = z.string().regex(/^#([0-9a-fA-F]{6})$/, 'must be #RRGGBB');

/** ffmpeg encode parameters for a preset. */
export const EncodeConfigSchema = z.object({
  fps: z.union([z.literal(24), z.literal(30), z.literal(60)]),
  /** x264 CRF; lower = better quality, larger files. 18-28 is sane. */
  crf: z.number().int().min(14).max(32),
  preset: EncodePresetSchema,
  audio_bitrate_kbps: z.number().int().min(64).max(320),
});
export type EncodeConfig = z.infer<typeof EncodeConfigSchema>;

/** How the preset's logo is composited onto the frame. */
export const LogoConfigSchema = z.object({
  /** Reference to a row in the `logos` table. */
  logo_id: z.string().uuid(),
  anchor: AnchorSchema,
  padding_px: z.number().int().min(0).max(400),
  /** Logo width as a percentage of frame width (1-50). */
  scale_pct: z.number().min(1).max(50),
  opacity: z.number().min(0).max(1),
});
export type LogoConfig = z.infer<typeof LogoConfigSchema>;

/** libass burn-in style for subtitles. */
export const SubtitleConfigSchema = z.object({
  enabled: z.boolean(),
  font_family: z.string().min(1).max(64),
  font_size_px: z.number().int().min(12).max(200),
  primary_color: HexColor,
  outline_color: HexColor,
  outline_width: z.number().int().min(0).max(20),
  alignment: AnchorSchema,
  margin_v_px: z.number().int().min(0).max(800),
  max_lines: z.number().int().min(1).max(8),
  /**
   * Pixels reserved at the top and bottom of vertical clips so subtitles
   * stay clear of TikTok / Reels / Shorts UI overlays.
   */
  safe_area_px: z.number().int().min(0).max(800),
});
export type SubtitleConfig = z.infer<typeof SubtitleConfigSchema>;

/** Min/max clip duration in seconds. */
export const DurationConfigSchema = z
  .object({
    min_s: z.number().int().min(5).max(3600),
    max_s: z.number().int().min(5).max(3600),
  })
  .refine((d) => d.max_s >= d.min_s, {
    message: 'max_s must be >= min_s',
    path: ['max_s'],
  });
export type DurationConfig = z.infer<typeof DurationConfigSchema>;

/** Output frame dimensions in pixels. */
export const DimensionsSchema = z
  .object({
    width: z.number().int().min(120).max(7680),
    height: z.number().int().min(120).max(4320),
  })
  .refine((d) => d.width % 2 === 0 && d.height % 2 === 0, {
    message: 'width and height must be even (yuv420p constraint)',
  });
export type Dimensions = z.infer<typeof DimensionsSchema>;

/** A complete preset definition. */
export const PresetSchema = z.object({
  schema_version: z.literal(PRESET_SCHEMA_VERSION),
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  kind: ClipKindSchema,
  orientation: OrientationSchema,
  dimensions: DimensionsSchema,
  duration: DurationConfigSchema,
  encode: EncodeConfigSchema,
  /** `null` means no logo overlay. */
  logo: LogoConfigSchema.nullable(),
  subtitles: SubtitleConfigSchema,
});
export type Preset = z.infer<typeof PresetSchema>;

/**
 * Subset of a preset that the user fills out when creating one. The
 * server fills in `id` and `schema_version`.
 */
export const PresetInputSchema = PresetSchema.omit({
  id: true,
  schema_version: true,
});
export type PresetInput = z.infer<typeof PresetInputSchema>;

/**
 * Migrate a preset coming from an older schema version up to the
 * current one. Returns the validated preset on success.
 *
 * Add a new branch here whenever {@link PRESET_SCHEMA_VERSION} bumps.
 */
export function migratePreset(raw: unknown): Preset {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('preset import: expected an object');
  }
  const v = (raw as { schema_version?: unknown }).schema_version;
  if (v === PRESET_SCHEMA_VERSION) {
    return PresetSchema.parse(raw);
  }
  throw new Error(
    `preset import: unsupported schema_version ${String(v)} (expected ${PRESET_SCHEMA_VERSION})`,
  );
}

/**
 * Default long-form preset (16:9, 1080p) seeded on first run.
 * `id` and `logo` are filled in by the seeder / user.
 */
export const DEFAULT_LONGFORM_PRESET: PresetInput = {
  name: 'Longform 16:9',
  kind: 'longform',
  orientation: 'horizontal',
  dimensions: { width: 1920, height: 1080 },
  duration: { min_s: 180, max_s: 360 },
  encode: { fps: 30, crf: 20, preset: 'medium', audio_bitrate_kbps: 192 },
  logo: null,
  subtitles: {
    enabled: true,
    font_family: 'DejaVu Sans',
    font_size_px: 42,
    primary_color: '#FFFFFF',
    outline_color: '#000000',
    outline_width: 2,
    alignment: 'bottom_center',
    margin_v_px: 80,
    max_lines: 2,
    safe_area_px: 0,
  },
};

/**
 * Default short-form preset (9:16, 1080x1920) seeded on first run.
 */
export const DEFAULT_SHORTFORM_PRESET: PresetInput = {
  name: 'Shortform 9:16',
  kind: 'shortform',
  orientation: 'vertical',
  dimensions: { width: 1080, height: 1920 },
  duration: { min_s: 27, max_s: 80 },
  encode: { fps: 30, crf: 20, preset: 'medium', audio_bitrate_kbps: 192 },
  logo: null,
  subtitles: {
    enabled: true,
    font_family: 'DejaVu Sans',
    font_size_px: 56,
    primary_color: '#FFFFFF',
    outline_color: '#000000',
    outline_width: 3,
    alignment: 'middle_center',
    margin_v_px: 0,
    max_lines: 2,
    /** Keeps captions out of the TikTok / Reels overlay zones. */
    safe_area_px: 240,
  },
};
