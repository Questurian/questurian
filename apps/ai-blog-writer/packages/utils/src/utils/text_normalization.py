import re
from typing import List, Tuple

from shared import NormalizationEdit, SpeakerSegment
from .ai_normalizer import AITranscriptNormalizer


_STAGE_DIRECTIONS = re.compile(r"\[(.*?)\]")
_PAREN_STAGE = re.compile(
    r"\((?:music|applause|laughter|silence|intro|outro).*?\)",
    re.IGNORECASE,
)


def normalize_transcript(text: str) -> Tuple[str, List[NormalizationEdit]]:
    """Clean transcript text and return edits applied."""
    edits: List[NormalizationEdit] = []

    def _strip_pattern(
        pattern: re.Pattern,
        label: str,
        current: str,
    ) -> str:
        matches = list(pattern.finditer(current))
        if matches:
            edits.append(
                NormalizationEdit(edit_type="remove_pattern", detail=label)
            )
        return pattern.sub("", current)

    cleaned = text.strip()
    cleaned = _strip_pattern(_STAGE_DIRECTIONS, "stage_directions", cleaned)
    cleaned = _strip_pattern(_PAREN_STAGE, "parenthetical_stage", cleaned)

    lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
    deduped: List[str] = []
    for line in lines:
        if not deduped or deduped[-1] != line:
            deduped.append(line)
        else:
            edits.append(
                NormalizationEdit(edit_type="dedupe_line", detail=line)
            )

    normalized_lines = [
        re.sub(r"\s+", " ", line).strip() for line in deduped
    ]
    cleaned = "\n".join(normalized_lines)
    edits.append(
        NormalizationEdit(
            edit_type="normalize_whitespace", detail="collapse_whitespace"
        )
    )
    return cleaned.strip(), edits


def infer_speaker_segments(text: str) -> List[SpeakerSegment]:
    """Infer speaker turns based on simple NAME: patterns."""
    segments: List[SpeakerSegment] = []
    cursor = 0
    current_speaker = "Unknown"
    current_start = 0
    buffer: List[str] = []

    def flush_segment(end_char: int) -> None:
        nonlocal buffer, current_start
        if not buffer:
            return
        content = " ".join(buffer).strip()
        if not content:
            buffer = []
            return
        segments.append(
            SpeakerSegment(
                speaker=current_speaker,
                start_char=current_start,
                end_char=end_char,
                text=content,
            )
        )
        buffer = []

    for line in text.split("\n"):
        line = line.strip()
        if not line:
            cursor += 1
            continue
        match = re.match(
            r"^([A-Za-z][A-Za-z0-9 \-]{1,32}):\s*(.*)$",
            line,
        )
        if match:
            flush_segment(cursor)
            current_speaker = match.group(1).strip()
            content = match.group(2).strip()
            current_start = cursor
            buffer = [content] if content else []
        else:
            buffer.append(line)
        cursor += len(line) + 1

    flush_segment(cursor)
    return segments


def normalize_transcript_ai(text: str) -> Tuple[str, List[NormalizationEdit]]:
    """AI-powered transcript normalization with hard failure on errors."""
    normalizer = AITranscriptNormalizer()

    try:
        cleaned = normalizer.normalize(text)

        edits = [NormalizationEdit(
            edit_type="ai_normalization",
            detail=f"AI processed {len(text)} -> {len(cleaned)} chars"
        )]

        return cleaned, edits

    except Exception as e:
        # Re-raise with context for pipeline error handling
        raise RuntimeError(f"AI transcript normalization failed: {str(e)}") from e
