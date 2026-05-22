/**
 * Source schemas — describe where a run's video came from.
 *
 * Three source types in v1:
 *   - `upload`: a file the user uploaded through the browser
 *   - `youtube_vod`: a regular YouTube URL fetched with yt-dlp
 *   - `youtube_live`: a YouTube livestream URL recorded with yt-dlp
 *
 * Folder import, S3, Drive, and SMB sources are intentionally absent.
 */

import { z } from 'zod';

export const SourceTypeSchema = z.enum(['upload', 'youtube_vod', 'youtube_live']);
export type SourceType = z.infer<typeof SourceTypeSchema>;

/** Server-issued upload session for chunked file uploads. */
export const UploadSessionSchema = z.object({
  upload_id: z.string().uuid(),
  filename: z.string().min(1).max(512),
  mime: z.string().min(1).max(128),
  total_size: z.number().int().min(1),
});
export type UploadSession = z.infer<typeof UploadSessionSchema>;

const YouTubeUrl = z
  .string()
  .url()
  .refine((s) => /(?:youtube\.com|youtu\.be)\//i.test(s), 'must be a youtube.com or youtu.be URL');

/** Discriminated union of source descriptors. */
export const SourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('upload'),
    upload_id: z.string().uuid(),
    filename: z.string().min(1).max(512),
  }),
  z.object({
    type: z.literal('youtube_vod'),
    url: YouTubeUrl,
  }),
  z.object({
    type: z.literal('youtube_live'),
    url: YouTubeUrl,
    /** Hard cap on capture length, seconds. Subject to server config too. */
    max_duration_s: z.number().int().min(60).max(86_400).optional(),
  }),
]);
export type Source = z.infer<typeof SourceSchema>;
