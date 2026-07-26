from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.core import (
    get_article_type_by_id,
    get_article_type_by_name,
    read_article_type_name_definitions,
)

from ..config import (
    PROMPT2BLOG_GUIDELINE_FILE_ALIASES,
    PROMPT2BLOG_GUIDELINES_DIR,
    PROMPT2BLOG_TITLE_FILE_ALIASES,
    PROMPT2BLOG_TITLE_GUIDELINES_DIR,
)
from ..options import (
    _default_option,
    _load_prompt2blog_option_catalog,
    _read_article_type_markdown,
)
from ..support import _safe_str

router = APIRouter()


@router.get("/input-options")
async def get_input_options() -> JSONResponse:
    """Return Prompt2Blog dropdown options sourced from DB + markdown catalogs."""
    article_types = []
    for item in read_article_type_name_definitions():
        article_type_row = get_article_type_by_name(_safe_str(item.get("name")))
        if not article_type_row:
            continue
        article_types.append(
            {
                "id": article_type_row["id"],
                "name": article_type_row["name"],
                "definition": article_type_row["definition"],
            }
        )

    catalog = _load_prompt2blog_option_catalog()
    tones = catalog.get("tones", [])
    lengths = catalog.get("lengths", [])
    brand_voices = catalog.get("brand_voices", [])
    default_tone = _default_option(tones)
    default_length = _default_option(lengths)
    default_brand_voice = _default_option(brand_voices)

    return JSONResponse(
        {
            "article_types": article_types,
            "tones": tones,
            "lengths": lengths,
            "brand_voices": brand_voices,
            "defaults": {
                "tone_id": _safe_str(default_tone.get("id")) if default_tone else "",
                "length_id": (
                    _safe_str(default_length.get("id")) if default_length else ""
                ),
                "brand_voice_id": (
                    _safe_str(default_brand_voice.get("id"))
                    if default_brand_voice
                    else ""
                ),
            },
        }
    )


@router.get("/article-types/{article_type_id}/guideline-preview")
async def get_article_type_guideline_preview(article_type_id: int) -> JSONResponse:
    """Return resolved guideline markdown for selected article type."""
    article_type = get_article_type_by_id(article_type_id)
    if not article_type:
        raise HTTPException(status_code=404, detail="Article type not found")

    guideline_text, guideline_file = _read_article_type_markdown(
        article_type_name=_safe_str(article_type.get("name")),
        directory=PROMPT2BLOG_GUIDELINES_DIR,
        fallback=_safe_str(article_type.get("guideline")),
        aliases=PROMPT2BLOG_GUIDELINE_FILE_ALIASES,
    )
    title_guideline_text, title_guideline_file = _read_article_type_markdown(
        article_type_name=_safe_str(article_type.get("name")),
        directory=PROMPT2BLOG_TITLE_GUIDELINES_DIR,
        fallback=_safe_str(article_type.get("title_guideline")),
        aliases=PROMPT2BLOG_TITLE_FILE_ALIASES,
    )

    return JSONResponse(
        {
            "id": article_type["id"],
            "name": article_type["name"],
            "guideline": guideline_text,
            "title_guideline": title_guideline_text,
            "guideline_file": guideline_file,
            "title_guideline_file": title_guideline_file,
        }
    )
