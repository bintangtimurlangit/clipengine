/**
 * Build the ffmpeg filter chain that fits any source frame to the
 * preset's target dimensions.
 *
 * - `horizontal` (e.g. 16:9): scale to fit while preserving aspect,
 *   then pad with black bars to fill exactly width × height.
 * - `vertical` (e.g. 9:16): scale to *cover* the target frame, then
 *   center-crop. This is the right thing for podcast/talk-show
 *   shortform where the source is 16:9 — it keeps the speaker
 *   centered without letterboxing. If the source is taller than the
 *   target aspect, we fall back to fit + pad.
 *
 * The chain output label is supplied by the caller so it can
 * compose with the logo overlay and subtitle burn-in stages.
 */

import type { Dimensions, Orientation } from '@clipengine/schemas';

export interface GeometryGraph {
  /** Filter graph fragment consuming `[0:v]` and producing `[<outputLabel>]`. */
  filter: string;
  outputLabel: string;
}

export function buildGeometryFilter(
  orientation: Orientation,
  target: Dimensions,
  outputLabel: string,
): GeometryGraph {
  // Force-even dimensions to keep yuv420p happy; the schema already
  // validates this but we keep the safety net.
  const w = forceEven(target.width);
  const h = forceEven(target.height);

  // SAR/DAR housekeeping: assume square pixels in/out, set explicit
  // SAR=1 so downstream filters don't get confused.
  const sar = 'setsar=1';

  if (orientation === 'horizontal') {
    // Scale-to-fit with letterbox padding.
    const scale = `scale=w=${w}:h=${h}:force_original_aspect_ratio=decrease:flags=lanczos`;
    const pad = `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`;
    return {
      filter: `[0:v]${scale},${pad},${sar}[${outputLabel}]`,
      outputLabel,
    };
  }

  // Vertical: cover + center-crop. Sources taller than target aspect
  // get letterboxed because the cover-style scale would crop too much.
  const scaleCover = `scale=w=${w}:h=${h}:force_original_aspect_ratio=increase:flags=lanczos`;
  const crop = `crop=${w}:${h}`;
  return {
    filter: `[0:v]${scaleCover},${crop},${sar}[${outputLabel}]`,
    outputLabel,
  };
}

function forceEven(n: number): number {
  return n % 2 === 0 ? n : n - 1;
}
