"""
Stage 4: Article title generation.

This stage:
1. Retrieves the title_guideline for the classified article type
2. Uses the article draft from Stage 3 and the title guideline
3. Generates an optimized title following editorial guidelines
"""
import logging

from langchain.prompts import PromptTemplate

from app.features.youtube2blog.storage import get_article_type_by_name
from shared import Stage3Output, Stage4Output
from utils import LLMPresets

logger = logging.getLogger(__name__)

TITLE_GENERATION_PROMPT = """You are an expert content strategist and headline writer. Your task is to create a compelling article title that accurately represents the content while following specific editorial guidelines.

## Your Task
Generate a single, optimized title for the article provided below. The title must:
1. Accurately reflects the article's content
2. Fully complies with the provided title guideline
3. Is engaging and encourages readership
4. Is clear, specific, and non-generic

## Original Title (Baseline)
{original_title}

Use this original title as a baseline and starting point. Preserve the core subject matter and key terms from the original title where appropriate, while refining it to comply with the title guideline and better represent the article content.

## Article Content
{article}

## Title Guideline
{guideline}

## Instructions
- Use the original title as a baseline - preserve its core subject and key terminology where relevant
- Read the article carefully to understand its core message and key takeaways
- Use the guideline as the primary constraint when crafting the title
- Do not infer, reinterpret, or add rules beyond what the guideline explicitly states
- Resolve any ambiguity by favoring strict compliance over creativity
- Do not prioritize style, SEO, or creativity unless the guideline requires it


## Output Rules (Strict)
- Output exactly ONE title
- No explanations, reasoning, alternatives, or formatting
- No quotation marks
- Format the title in title case, capitalizing the main words
- Please ensure the title is complete and fully formed
- The title must be fully formed and not cut off. Make sure the response includes the entire title without any truncation.
- The title should accurately reflect the key points of the article and avoid any hallucinations or inaccuracies.
"""


def _retrieve_title_guideline(article_type: str) -> str:
    """Fetch title_guideline from article_types table."""
    article_type_data = get_article_type_by_name(article_type)
    if not article_type_data:
        logger.warning(f"No article type found for: {article_type}")
        return ""
    return article_type_data.get("title_guideline", "") or ""


def stage_4_generate_title(stage3: Stage3Output) -> Stage4Output:
    """
    Stage 4: Generate an optimized article title.

    1. Retrieve title_guideline for the classified article type
    2. Use the article draft and guideline to generate a title
    3. Return the generated title along with the article content
    """
    logger.info("=" * 60)
    logger.info("STAGE 4: Generating article title")
    logger.info("=" * 60)
    logger.info(f"  Video: {stage3.title}")
    logger.info(f"  Article Type: {stage3.article_type}")
    logger.info(f"  Article length: {len(stage3.final_article)} chars")

    # Initialize Vertex AI using shared preset
    llm = LLMPresets.title_generation()

    # Step 1: Retrieve title guideline
    logger.info("  Step 1: Retrieving title guideline...")
    title_guideline = _retrieve_title_guideline(stage3.article_type)
    if not title_guideline:
        logger.warning(f"  No title guideline found for article type: {stage3.article_type}")
        title_guideline = "Create a clear, descriptive title that accurately reflects the article content."

    logger.info(f"  Title guideline length: {len(title_guideline)} chars")

    # Step 2: Generate title
    logger.info("  Step 2: Generating title...")
    logger.info(f"  Original title (baseline): {stage3.title}")
    prompt = PromptTemplate(
        input_variables=["original_title", "article", "guideline"],
        template=TITLE_GENERATION_PROMPT,
    )

    full_prompt = prompt.format(
        original_title=stage3.title,
        article=stage3.final_article,
        guideline=title_guideline,
    )
    logger.info(f"  Title generation prompt length: {len(full_prompt)} chars")

    result = llm.invoke(full_prompt)
    logger.info(f"  Title generation response length: {len(result) if result else 0} chars")

    if not result or not result.strip():
        raise RuntimeError("Title generation failed: LLM returned empty response")

    # Clean up the generated title - minimal processing to avoid truncation
    generated_title = result.strip()
    # Remove any quotes that might have been added
    generated_title = generated_title.strip('"\'')
    # Remove markdown formatting if present
    generated_title = generated_title.lstrip('#').strip()

    logger.info(f"  Generated title: {generated_title}")

    output = Stage4Output(
        video_id=stage3.video_id,
        title=generated_title,
        content=stage3.final_article,
        article_type=stage3.article_type,
        title_guideline_used=title_guideline,
        debug_prompt=full_prompt,
        debug_raw_response=result,
    )

    logger.info("=" * 60)
    logger.info("  Stage 4 complete!")
    logger.info("=" * 60)

    return output
