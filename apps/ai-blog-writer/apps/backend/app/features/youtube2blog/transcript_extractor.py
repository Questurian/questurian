"""
YouTube transcript extraction via youtube-transcript-api.
"""
from __future__ import annotations

from typing import Any

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    CouldNotRetrieveTranscript,
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable,
)


def _fetch_best_transcript(video_id: str):
    """Fetch English transcript first; fall back to any available language."""
    api = YouTubeTranscriptApi()
    try:
        return api.fetch(video_id)  # defaults to English
    except NoTranscriptFound:
        transcript_list = api.list(video_id)
        return next(iter(transcript_list)).fetch()


def extract_transcript_sync(video_id: str) -> dict[str, Any]:
    """
    Extract transcript text for a YouTube video.

    Returns:
    - {"status": "completed", "transcript": "..."}
    - {"status": "unavailable", "error": "..."}
    - {"status": "failed", "error": "..."}
    """
    try:
        transcript = _fetch_best_transcript(video_id)
        lines: list[str] = []

        for snippet in transcript.snippets:
            text = snippet.text.strip().replace("\n", " ")
            if text:
                lines.append(text)

        cleaned = "\n".join(lines).strip()
        if not cleaned:
            return {
                "status": "failed",
                "error": "Transcript was empty after extraction.",
            }

        return {
            "status": "completed",
            "transcript": cleaned,
        }
    except TranscriptsDisabled:
        return {
            "status": "unavailable",
            "error": "Transcripts are disabled for this video.",
        }
    except NoTranscriptFound:
        return {
            "status": "unavailable",
            "error": "No transcript found for this video.",
        }
    except CouldNotRetrieveTranscript as exc:
        return {
            "status": "unavailable",
            "error": str(exc),
        }
    except VideoUnavailable:
        return {
            "status": "failed",
            "error": "Video is unavailable.",
        }
    except Exception as exc:  # pragma: no cover - defensive catch-all
        return {
            "status": "failed",
            "error": str(exc),
        }
