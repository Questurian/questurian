"""
Stage 1: Clean transcript text from the raw video record.
"""
import logging

from langchain_core.prompts import PromptTemplate

from shared import RawVideoRecord, Stage1Output
from utils import LLMPresets

logger = logging.getLogger(__name__)


def stage_1_clean_transcript(record: RawVideoRecord) -> Stage1Output:
    """
    Stage 1: Clean transcript text with AI.

    Removes:
    - Intros/outros
    - Ad reads/sponsor segments
    - Calls to action
    - Filler content

    Returns cleaned transcript ready for further processing.
    """
    logger.info("=" * 60)
    logger.info("STAGE 1: Cleaning transcript with AI")
    logger.info("=" * 60)
    logger.info(f"  Video: {record.title}")
    logger.info(f"  Input transcript: {len(record.transcript)} chars")

    # Initialize Vertex AI using shared preset
    llm = LLMPresets.transcript_cleaning()

    prompt = PromptTemplate(
        input_variables=["transcript"],
        template="""You are a transcript cleaner. Extract ONLY the core content from this video transcript.

REMOVE:
- Intros and outros ("Hey everyone, welcome back...")
- Ad reads and sponsor segments ("This video is sponsored by...")
- Calls to action ("Don't forget to like and subscribe...")
- Off-topic tangents
- Filler phrases and repetition

KEEP:
- Main educational/informational content
- Key examples and explanations
- Important quotes and insights

Return ONLY the cleaned transcript text. No JSON, no explanations - just the cleaned content.

Transcript:
{transcript}"""
    )

    logger.info("  Sending to Vertex AI...")
    result = llm.invoke(prompt.format(transcript=record.transcript))
    logger.info("  Received response from Vertex AI")

    cleaned_transcript = result.strip()

    output = Stage1Output(
        video_id=record.video_id,
        title=record.title,
        cleaned_transcript=cleaned_transcript,
    )

    logger.info(f"  Output transcript: {len(output.cleaned_transcript)} chars")
    reduction = 100 - (
        len(output.cleaned_transcript) / max(1, len(record.transcript)) * 100
    )
    logger.info(f"  Reduction: {reduction:.1f}%")
    logger.info("=" * 60)

    return output
