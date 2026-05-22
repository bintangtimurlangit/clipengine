/**
 * `@clipengine/core` — the engine.
 *
 * Pure logic, no HTTP, no DB, no auth. Takes paths and validated
 * config in, writes artifact files out under a workspace directory
 * the caller controls.
 *
 * Public stages:
 *   - `ingest` — audio probe, WAV extraction, Whisper transcription.
 *   - `plan` — LLM cut planner with optional web research.
 *   - `render` — ffmpeg encode with logo overlay and subtitle burn-in.
 */

export * from './ingest/index.js';
export * from './plan/index.js';
export * from './render/index.js';
