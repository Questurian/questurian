from typing import List, Tuple

from shared import ApproxTimeMapping, TranscriptChunk


def chunk_text(
    text: str, chunk_size: int = 1200, overlap_ratio: float = 0.15
) -> Tuple[List[TranscriptChunk], List[ApproxTimeMapping]]:
    """Chunk text into overlapping windows and approximate time mapping."""
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")
    if not 0 <= overlap_ratio < 1:
        raise ValueError("overlap_ratio must be between 0 and 1")

    step = max(1, int(chunk_size * (1 - overlap_ratio)))
    chunks: List[TranscriptChunk] = []
    mappings: List[ApproxTimeMapping] = []
    text_length = len(text)
    chars_per_sec = 15.0

    chunk_index = 0
    for start in range(0, text_length, step):
        end = min(text_length, start + chunk_size)
        chunk_text = text[start:end]
        chunk_id = f"chunk_{chunk_index:04d}"
        chunks.append(
            TranscriptChunk(
                chunk_id=chunk_id,
                start_char=start,
                end_char=end,
                text=chunk_text,
            )
        )
        mappings.append(
            ApproxTimeMapping(
                start_char=start,
                end_char=end,
                start_time_sec=start / chars_per_sec,
                end_time_sec=end / chars_per_sec,
            )
        )
        chunk_index += 1
        if end >= text_length:
            break

    return chunks, mappings
