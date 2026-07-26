"""Read-only option adapters for URL2Blog."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.shared.tone_profiles import load_tone_profiles

router = APIRouter()


@router.get("/tones")
async def get_tones() -> JSONResponse:
    return JSONResponse({"tones": load_tone_profiles()})
