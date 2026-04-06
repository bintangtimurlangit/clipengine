import { describe, expect, it } from "vitest";

import {
  isActiveRun,
  pipelinePhase,
  pipelineProgressValue,
  pipelineStatusMessage,
} from "./pipeline-status";

describe("isActiveRun", () => {
  it("is true for fetching and running", () => {
    expect(isActiveRun("fetching")).toBe(true);
    expect(isActiveRun("running")).toBe(true);
  });

  it("is false for terminal and idle states", () => {
    expect(isActiveRun("ready")).toBe(false);
    expect(isActiveRun("completed")).toBe(false);
    expect(isActiveRun("failed")).toBe(false);
  });
});

describe("pipelineStatusMessage", () => {
  it("describes fetching and running steps", () => {
    expect(pipelineStatusMessage("fetching", null)).toContain("Downloading");
    expect(pipelineStatusMessage("running", "ingest")).toContain("Transcribing");
    expect(pipelineStatusMessage("running", "plan")).toContain("Planning");
    expect(pipelineStatusMessage("running", "render")).toContain("Rendering");
  });
});

describe("pipelineProgressValue", () => {
  it("is indeterminate for fetching", () => {
    expect(pipelineProgressValue("fetching", null)).toBeNull();
  });

  it("maps running steps to coarse percentages", () => {
    expect(pipelineProgressValue("running", "ingest")).toBe(25);
    expect(pipelineProgressValue("running", "plan")).toBe(50);
    expect(pipelineProgressValue("running", "render")).toBe(80);
  });

  it("is null for failed runs", () => {
    expect(pipelineProgressValue("failed", null)).toBeNull();
  });

  it("is 100 for completed", () => {
    expect(pipelineProgressValue("completed", "done")).toBe(100);
  });
});

describe("pipelinePhase", () => {
  it("maps status and step to strip phase", () => {
    expect(pipelinePhase("fetching", null)).toBe("fetch");
    expect(pipelinePhase("running", "ingest")).toBe("ingest");
    expect(pipelinePhase("running", "plan")).toBe("plan");
    expect(pipelinePhase("running", "render")).toBe("render");
    expect(pipelinePhase("running", "done")).toBe("render");
    expect(pipelinePhase("ready", null)).toBe("idle");
  });
});
