/** Static copy for /help (pipeline + artifacts). */

export const DOCS_PIPELINE_URL =
  "https://github.com/bintangtimurlangit/clipengine/blob/main/docs/pipeline.md";

export const DOCS_BIND_MOUNTS_URL =
  "https://github.com/bintangtimurlangit/clipengine/blob/main/docs/bind-mounts.md";

export const PIPELINE_STATUS =
  "Use the dashboard to import media, run the pipeline, and manage outputs. This page summarizes stages, artifacts, bind mounts, and requirements.";

export type FeatureBlock = {
  id: string;
  title: string;
  step: string;
  description: string;
  flags: string[];
  outputs: string[];
};

export const FEATURES: FeatureBlock[] = [
  {
    id: "ingest",
    title: "Ingest",
    step: "transcribe",
    description:
      "FFmpeg extracts 16 kHz mono audio; speech-to-text via **local faster-whisper** (tiny) or **OpenAI** whisper-1—choose under **Settings → Transcription**.",
    flags: [
      "Model / backend: Settings → Transcription (local vs OpenAI)",
      "Optional language hint on Import or per run",
    ],
    outputs: [
      "transcript.json",
      "segments.vtt",
      "audio_16k_mono.wav",
    ],
  },
  {
    id: "plan",
    title: "Plan",
    step: "cut plan",
    description:
      "Build **cut_plan.json** from the transcript with your **primary** LLM and optional **fallback** profiles (**Settings → LLM**). Optional **web search** context: **Settings → Search** or `SEARCH_PROVIDER_MAIN` / `SEARCH_PROVIDER_FALLBACK` (see configuration).",
    flags: [
      "LLM: Settings → LLM (primary + fallbacks, keys in SQLite)",
      "Search: Settings → Search or env (Tavily, Brave, DuckDuckGo, …)",
      "Optional episode title for extra context on the run",
    ],
    outputs: ["cut_plan.json"],
  },
  {
    id: "render",
    title: "Render",
    step: "ffmpeg",
    description:
      "Trim and encode **longform (16:9)** and **shortform (9:16)** MP4s plus one JPEG thumbnail per clip. When **transcript.json** is present, snapping avoids mid-utterance cuts.",
    flags: [
      "Artifacts live under the run workspace (default) or your chosen output destination",
      "Multi-audio files: pick a stream on the run before starting",
    ],
    outputs: [
      "rendered/longform/*.mp4",
      "rendered/longform/*.jpg",
      "rendered/shortform/*.mp4",
      "rendered/shortform/*.jpg",
    ],
  },
  {
    id: "run-all",
    title: "Full pipeline",
    step: "start",
    description:
      "From a run in **Ready** state, **Start pipeline** runs ingest → plan → render in one workspace folder.",
    flags: [
      "Import → open run → Start pipeline",
      "Whisper options chosen at import / run creation",
    ],
    outputs: [
      "Same artifact tree as the three steps",
      "transcript.json, cut_plan.json, rendered/…",
    ],
  },
];

export const ARTIFACT_ROWS: { path: string; producedBy: string }[] = [
  { path: "transcript.json", producedBy: "ingest" },
  { path: "segments.vtt", producedBy: "ingest" },
  { path: "audio_16k_mono.wav", producedBy: "ingest" },
  { path: "cut_plan.json", producedBy: "plan" },
  { path: "llm_activity.log", producedBy: "plan (LLM runs only)" },
  {
    path: "rendered/longform/*.mp4",
    producedBy: "render",
  },
  {
    path: "rendered/shortform/*.mp4",
    producedBy: "render",
  },
  {
    path: "rendered/longform/*.jpg",
    producedBy: "render",
  },
  {
    path: "rendered/shortform/*.jpg",
    producedBy: "render",
  },
];

export const REQUIREMENTS: string[] = [
  "Docker Compose (recommended): API + Web on one host; see docs/docker.md.",
  "FFmpeg / ffprobe inside the API container image.",
  "LLM + optional web search: configure under Settings (SQLite) or environment—see docs/configuration.md (search providers include Tavily, Brave, DuckDuckGo, …).",
  "Transcription: local Whisper (GPU optional) or OpenAI API—Settings → Transcription.",
];

export type CheatCommand = {
  id: string;
  label: string;
  text: string;
};

/** Copy-friendly reminders — dashboard workflow. */
export const CHEAT_SHEET: CheatCommand[] = [
  {
    id: "import",
    label: "Import media",
    text:
      "Dashboard → Import → Upload file, pick from an allowlisted folder, or paste a YouTube URL. Then open the run.",
  },
  {
    id: "settings",
    label: "LLM & search",
    text:
      "Dashboard → Settings → LLM: OpenAI-compatible or Anthropic profiles (primary + fallbacks, keys in SQLite). Settings → Search: web providers for the plan step when context is enabled.",
  },
  {
    id: "pipeline",
    label: "Run pipeline",
    text:
      "Runs → [your run] → Start pipeline (ingest → plan → render). Poll status on the same page.",
  },
  {
    id: "library",
    label: "Clips & files",
    text:
      "Library for cut-plan cards; run detail page for artifact downloads and rendered MP4s.",
  },
];
