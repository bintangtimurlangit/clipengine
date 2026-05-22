/**
 * Logo overlay filter graph.
 *
 * Builds the ffmpeg filter snippet that places a PNG logo onto a
 * frame at the configured anchor, padding, scale, and opacity. The
 * result composes with the geometry filter chain (16:9 fit-pad or
 * 9:16 zoom-crop-pad) before the subtitle burn-in step.
 */

import type { Anchor, Dimensions, LogoConfig } from '@clipengine/schemas';

export interface LogoOverlayInput {
  /** Resolved on-disk path to the logo PNG. */
  path: string;
  config: LogoConfig;
  /** Final frame dimensions; controls anchor math. */
  dimensions: Dimensions;
}

export interface LogoOverlayGraph {
  /** Extra `-i <path>` arguments for ffmpeg, in order. */
  extraInputs: string[];
  /**
   * Filter graph fragment that consumes `[<videoLabel>]` and the
   * extra logo input, returning `[<outputLabel>]`. Empty when no
   * logo is configured.
   */
  filter: string;
  /** Last label produced by the graph. */
  outputLabel: string;
}

/**
 * Build the overlay filter graph.
 *
 * @param videoLabel    Label of the video stream that the overlay
 *                      runs on top of (e.g. `vgeom` after the
 *                      geometry stage).
 * @param outputLabel   Label to assign to the final overlaid stream.
 * @param input         Logo configuration, or null when disabled.
 */
export function buildLogoOverlay(
  videoLabel: string,
  outputLabel: string,
  input: LogoOverlayInput | null,
): LogoOverlayGraph {
  if (!input) {
    return { extraInputs: [], filter: '', outputLabel: videoLabel };
  }

  const { config, dimensions, path } = input;
  const widthPx = Math.max(1, Math.round((config.scale_pct / 100) * dimensions.width));
  const { x, y } = anchorToOverlayCoords(config.anchor, dimensions, config.padding_px);
  const opacity = clamp01(config.opacity);

  // Take the second input (the logo PNG), scale to width preserving
  // aspect, then apply alpha so the user-configured opacity sticks.
  const logoChain = [
    `[1:v]scale=${widthPx}:-1:flags=lanczos,format=rgba,colorchannelmixer=aa=${opacity.toFixed(3)}[lg]`,
  ].join(',');
  const overlayChain = `[${videoLabel}][lg]overlay=x=${x}:y=${y}:format=auto[${outputLabel}]`;

  return {
    extraInputs: ['-i', path],
    filter: `${logoChain};${overlayChain}`,
    outputLabel,
  };
}

interface OverlayCoords {
  /** ffmpeg expression for x. */
  x: string;
  /** ffmpeg expression for y. */
  y: string;
}

function anchorToOverlayCoords(anchor: Anchor, dims: Dimensions, padding: number): OverlayCoords {
  const pad = Math.max(0, padding);
  // Filter expressions: W/H = main width/height, w/h = overlay width/height.
  const left = `${pad}`;
  const center = '(W-w)/2';
  const right = `W-w-${pad}`;
  const top = `${pad}`;
  const middle = '(H-h)/2';
  const bottom = `H-h-${pad}`;

  switch (anchor) {
    case 'top_left':
      return { x: left, y: top };
    case 'top_center':
      return { x: center, y: top };
    case 'top_right':
      return { x: right, y: top };
    case 'middle_left':
      return { x: left, y: middle };
    case 'middle_center':
      return { x: center, y: middle };
    case 'middle_right':
      return { x: right, y: middle };
    case 'bottom_left':
      return { x: left, y: bottom };
    case 'bottom_center':
      return { x: center, y: bottom };
    case 'bottom_right':
      return { x: right, y: bottom };
  }
  void dims; // dimensions are encoded into the W/H expressions, not literals
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 1;
  return Math.max(0, Math.min(1, value));
}
