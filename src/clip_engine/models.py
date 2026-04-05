"""Pydantic models for transcripts and cut plans."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class TranscriptSegment(BaseModel):
    start: float = Field(ge=0, description="Segment start time in seconds")
    end: float = Field(ge=0, description="Segment end time in seconds")
    text: str = Field(default="", description="Transcribed text")


class TranscriptDoc(BaseModel):
    """Written by `ingest`; consumed by `plan` and validation."""

    source_video: str
    duration_s: float = Field(ge=0)
    language: str | None = None
    segments: list[TranscriptSegment] = Field(default_factory=list)
    whisper_model: str | None = None


class ClipItem(BaseModel):
    start_s: float = Field(ge=0)
    end_s: float = Field(ge=0)
    title: str = ""
    rationale: str = ""


class VideoPlanningFoundation(BaseModel):
    """LLM + Tavily grounding: what video this is and what the web says about it."""

    foundation_summary: str = Field(
        default="",
        description="LLM acknowledgment of likely title, series, episode, or topic from the transcript.",
    )
    identity_search_query: str = Field(default="", description="Tavily query used to identify/catalog the video.")
    highlights_search_query: str = Field(
        default="",
        description="Tavily query for fan-favorite / most-discussed moments.",
    )
    tavily_identity_excerpt: str | None = Field(
        default=None,
        description="Truncated Tavily results for identity_search_query.",
    )
    tavily_highlights_excerpt: str | None = Field(
        default=None,
        description="Truncated Tavily results for highlights_search_query.",
    )


class CutPlan(BaseModel):
    """LLM output + render input."""

    longform_clips: list[ClipItem] = Field(default_factory=list)
    shortform_clips: list[ClipItem] = Field(default_factory=list)
    notes: str | None = None
    editorial_summary: str | None = Field(
        default=None,
        description=(
            "Optional LLM narrative: clip counts, priorities, shortform vs longform tradeoffs, "
            "rejected moments. Written when the planner prompt asks for it."
        ),
    )
    planning_foundation: VideoPlanningFoundation | None = Field(
        default=None,
        description="Populated when planning runs the Tavily foundation pipeline.",
    )


class RenderPreset(BaseModel):
    """FFmpeg target geometry."""

    kind: Literal["longform", "shortform"]
    width: int
    height: int
