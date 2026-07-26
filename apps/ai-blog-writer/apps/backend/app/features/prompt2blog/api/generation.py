from fastapi import APIRouter, HTTPException

from ..classification import _classify_cleaned_material
from ..config import DEFAULT_MODEL
from ..llm import _invoke_text_llm
from ..models import (
    ClassifyRequest,
    ClassifyResponse,
    SynthesizeRequest,
    SynthesizeResponse,
)
from ..prompts.preparation import SYNTHESIZE_PROMPT
from ..support import _safe_str

router = APIRouter()


@router.post("/synthesize", response_model=SynthesizeResponse)
async def synthesize_sources(req: SynthesizeRequest) -> SynthesizeResponse:
    """Take raw source blobs and return a synthesized overview."""
    try:
        combined = "\n\n---\n\n".join(b.strip() for b in req.blobs if b.strip())
        if not combined:
            return SynthesizeResponse(synthesized="")

        result = _invoke_text_llm(
            prompt=SYNTHESIZE_PROMPT + combined,
            max_tokens=4096,
            temperature=0.3,
            model_name=DEFAULT_MODEL,
        )
        return SynthesizeResponse(synthesized=result.strip())
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {exc}") from exc


@router.post("/classify", response_model=ClassifyResponse)
async def classify_article_type(req: ClassifyRequest) -> ClassifyResponse:
    """Given cleaned data and article types, return best matched type."""
    try:
        cleaned_data = _safe_str(req.cleaned_data)
        if not cleaned_data:
            raise HTTPException(status_code=400, detail="cleaned_data is required")
        if not req.article_types:
            raise HTTPException(status_code=400, detail="article_types is required")

        article_types = [
            {"name": item.name, "definition": item.definition}
            for item in req.article_types
        ]
        classification, result_text, _, _ = _classify_cleaned_material(
            cleaned_data=cleaned_data,
            article_types=article_types,
            writing_brief=req.writing_brief or {},
            model_name=DEFAULT_MODEL,
        )
        return ClassifyResponse(result=result_text, classification=classification)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500, detail=f"Classification failed: {exc}"
        ) from exc
