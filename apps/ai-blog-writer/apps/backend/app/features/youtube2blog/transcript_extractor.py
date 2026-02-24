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


def extract_transcript_sync(video_id: str) -> dict[str, Any]:
    """
    Extract transcript text for a YouTube video.

    Returns:
    - {"status": "completed", "transcript": "..."}
    - {"status": "unavailable", "error": "..."}
    - {"status": "failed", "error": "..."}
    """
    try:
        transcript = YouTubeTranscriptApi().fetch(video_id)
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
