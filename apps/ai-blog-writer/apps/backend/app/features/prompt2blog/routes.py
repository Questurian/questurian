"""
Prompt2Blog API routes.

Synthesise raw source material into a coherent overview using Vertex AI.
"""

import logging
from typing import List

from fastapi import APIRouter
from pydantic import BaseModel

from utils import get_vertex_llm

router = APIRouter(prefix="/prompt2blog", tags=["prompt2blog"])
logger = logging.getLogger(__name__)

SYNTHESIZE_PROMPT = (
    "Combine all these sources into a coherent overview, eliminating "
    "duplication, stripping irrelevant artifacts, and preserving the most "
    "essential facts and context. Organize it naturally by what the data "
    "itself suggests, while maintaining clarity.\n\n"
    "--- SOURCES ---\n"
)


class SynthesizeRequest(BaseModel):
    blobs: List[str]


class SynthesizeResponse(BaseModel):
    synthesized: str


@router.post("/synthesize", response_model=SynthesizeResponse)
async def synthesize_sources(req: SynthesizeRequest):
    """Take raw source blobs and return a synthesized overview."""
    combined = "\n\n---\n\n".join(b.strip() for b in req.blobs if b.strip())
    if not combined:
        return SynthesizeResponse(synthesized="")

    prompt = SYNTHESIZE_PROMPT + combined

    llm = get_vertex_llm(temperature=0.3, max_tokens=4096)
    result = llm.invoke(prompt)

    return SynthesizeResponse(synthesized=result.strip())
