"""
YouTube transcript extraction using youtube-transcript-api.
Fetches transcripts directly from YouTube's internal API.
"""

from typing import Dict
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
    CouldNotRetrieveTranscript,
)


def log(msg: str):
    """Print debug log message."""
    print(f"[TRANSCRIPT] {msg}")


def extract_transcript_sync(video_id: str, timeout: int = 60000) -> Dict:
    """
    Extract transcript from a YouTube video.

    Args:
        video_id: YouTube video ID (e.g., 'dQw4w9WgXcQ')
        timeout: Not used (kept for API compatibility)

    Returns:
        Dict with keys: status, transcript (if success), error (if failed)
        Status can be: 'completed', 'unavailable', 'failed'
    """
    log(f"Starting extraction for video_id: {video_id}")

    try:
        ytt = YouTubeTranscriptApi()

        # Try to fetch transcript (prefers manually created, falls back to auto-generated)
        log("Fetching transcript...")
        transcript = ytt.fetch(video_id)

        log(f"Got {len(transcript.snippets)} snippets, language: {transcript.language}")

        # Extract just the text, join with spaces (removing timestamps)
        lines = []
        for snippet in transcript.snippets:
            text = snippet.text.strip()
            # Replace newlines within snippets with spaces
            text = text.replace('\n', ' ')
            if text:
                lines.append(text)

        clean_text = '\n'.join(lines)
        log(f"Successfully extracted {len(clean_text)} characters")

        return {
            "status": "completed",
            "transcript": clean_text
        }

    except TranscriptsDisabled:
        log("Transcripts are disabled for this video")
        return {
            "status": "unavailable",
            "error": "Transcripts are disabled for this video"
        }
    except NoTranscriptFound:
        log("No transcript found for this video")
        return {
            "status": "unavailable",
            "error": "No transcript found for this video"
        }
    except CouldNotRetrieveTranscript as e:
        log(f"Could not retrieve transcript: {e}")
        return {
            "status": "unavailable",
            "error": str(e)
        }
    except VideoUnavailable:
        log("Video is unavailable")
        return {
            "status": "failed",
            "error": "Video is unavailable"
        }
    except Exception as e:
        log(f"Error: {type(e).__name__}: {e}")
        return {
            "status": "failed",
            "error": str(e)
        }
