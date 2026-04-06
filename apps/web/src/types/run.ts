export type PipelineRun = {
  id: string;
  status: string;
  step: string | null;
  sourceType: string;
  title: string | null;
  youtubeUrl: string | null;
  localSourcePath: string | null;
  sourceFilename: string | null;
  whisperModel: string;
  whisperDevice: string;
  whisperComputeType: string;
  error: string | null;
  extra: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type ImportRoot = { path: string; exists: boolean };

export type ArtifactRow = { path: string; size: number };

export type ClipItem = {
  id: string;
  kind: string;
  start_s: number;
  end_s: number;
  title: string;
  rationale: string;
  artifactPath: string | null;
};
