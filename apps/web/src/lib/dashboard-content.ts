/** Static copy for /help (pipeline + artifacts). */

export const DOCS_PIPELINE_URL =
  "https://github.com/bintangtimurlangit/clipengine/blob/main/docs/pipeline.md";

export const DOCS_BIND_MOUNTS_URL =
  "https://github.com/bintangtimurlangit/clipengine/blob/main/docs/bind-mounts.md";

export const PIPELINE_STATUS =
  "Use the dashboard to import media, run the pipeline, and manage outputs. This page summarizes pipeline steps and artifacts—the operator UI lives under Home, Import, Runs, Library, and Settings.";

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
      "Extract 16 kHz mono audio, run faster-whisper, and write a timestamped transcript plus WebVTT captions.",
    flags: [
      "Configure Whisper model / device on Import or per run",
      "Optional language hint",
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
      "Build cut_plan.json from a transcript using your configured LLM. If TAVILY_API_KEY is set, foundation + web context run automatically.",
    flags: [
      "Set LLM provider and keys under Settings",
      "Optional episode title for context",
    ],
    outputs: ["cut_plan.json"],
  },
  {
    id: "render",
    title: "Render",
    step: "ffmpeg",
    description:
      "Trim and encode longform (16:9) and shortform (9:16) MP4s. Transcript snapping avoids mid-utterance cuts when transcript.json is present.",
    flags: ["Outputs under rendered/ in the run workspace"],
    outputs: ["rendered/longform/*.mp4", "rendered/shortform/*.mp4"],
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
  {
    path: "rendered/longform/*.mp4",
    producedBy: "render",
  },
  {
    path: "rendered/shortform/*.mp4",
    producedBy: "render",
  },
];

export const REQUIREMENTS: string[] = [
  "Docker Compose (recommended): API + Web on one host; see docs/docker.md.",
  "FFmpeg / ffprobe inside the API container image.",
  "LLM: configure in Settings (SQLite). Optional TAVILY_API_KEY for web context during plan (Node for MCP on the host if needed).",
  "Whisper: optional GPU for the api container; CPU works.",
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
    label: "LLM & keys",
    text:
      "Dashboard → Settings → choose OpenAI-compatible or Anthropic, set models and API keys (stored in SQLite on the server).",
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
