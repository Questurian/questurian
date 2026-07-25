"""
Shared article types API routes.
"""
import sqlite3
import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.core import (
    delete_article_type,
    get_article_type_by_id,
    get_article_type_by_name,
    read_article_types,
    read_article_type_name_definitions,
    update_article_type_by_id,
    write_article_type,
)
from app.config import ARTICLE_GUIDELINES_DIR

router = APIRouter(prefix="/article-types", tags=["article-types"])

GUIDELINES_DIR = ARTICLE_GUIDELINES_DIR


def _normalize_guideline_key(value: str) -> str:
    normalized = value.replace("’", "'").replace("`", "'")
    normalized = normalized.lower()
    normalized = re.sub(r"\.md$", "", normalized)
    normalized = normalized.replace("&", " and ")
    normalized = re.sub(r"[^a-z0-9]+", "", normalized)
    return normalized


def _load_file_guideline(article_type_name: str) -> str | None:
    """Load the guideline markdown file content for an article type when available."""
    if not GUIDELINES_DIR.exists():
        return None

    # Fast path: exact filename match.
    exact_path = GUIDELINES_DIR / f"{article_type_name}.md"
    if exact_path.exists():
        return exact_path.read_text(encoding="utf-8")

    target_key = _normalize_guideline_key(article_type_name)
    if not target_key:
        return None

    for candidate in GUIDELINES_DIR.glob("*.md"):
        if _normalize_guideline_key(candidate.stem) == target_key:
            return candidate.read_text(encoding="utf-8")
    return None


def _with_file_guideline(article_type: dict) -> dict:
    """Return payload with guideline overridden by file content when present."""
    payload = dict(article_type)
    name = payload.get("name")
    if isinstance(name, str) and name.strip():
        file_guideline = _load_file_guideline(name)
        if file_guideline is not None:
            payload["guideline"] = file_guideline
    return payload


@router.get("")
async def get_article_types() -> JSONResponse:
    """Get all article types with their definitions."""
    try:
        article_types = [_with_file_guideline(row) for row in read_article_types()]
        return JSONResponse(article_types)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch article types: {exc}",
        ) from exc


@router.get("/name-definitions")
async def get_article_type_name_definitions() -> JSONResponse:
    """Get all article types with only name and definition fields."""
    try:
        article_types = read_article_type_name_definitions()
        return JSONResponse(article_types)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch article type name definitions: {exc}",
        ) from exc


@router.get("/{article_type_id}/guidelines")
async def get_article_type_guidelines_by_id(article_type_id: int) -> JSONResponse:
    """Get guidelines for an article type by ID."""
    try:
        article_type = get_article_type_by_id(article_type_id)
        if not article_type:
            raise HTTPException(status_code=404, detail="Article type not found")

        article_type = _with_file_guideline(article_type)
        return JSONResponse(
            {
                "id": article_type["id"],
                "name": article_type["name"],
                "guideline": article_type.get("guideline"),
                "title_guideline": article_type.get("title_guideline"),
            }
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch article type guidelines: {exc}",
        ) from exc


@router.get("/by-name/{name}/guidelines")
async def get_article_type_guidelines_by_name(name: str) -> JSONResponse:
    """Get guidelines for an article type by name."""
    try:
        article_type = get_article_type_by_name(name)
        if not article_type:
            raise HTTPException(status_code=404, detail="Article type not found")

        article_type = _with_file_guideline(article_type)
        return JSONResponse(
            {
                "id": article_type["id"],
                "name": article_type["name"],
                "guideline": article_type.get("guideline"),
                "title_guideline": article_type.get("title_guideline"),
            }
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch article type guidelines: {exc}",
        ) from exc


@router.post("")
async def create_article_type(request: dict) -> JSONResponse:
    """Create a new article type."""
    try:
        name = request.get("name")
        definition = request.get("definition")

        if not name or not definition:
            raise HTTPException(
                status_code=400,
                detail="Name and definition are required",
            )

        existing = get_article_type_by_name(name)
        if existing:
            raise HTTPException(
                status_code=400,
                detail="Article type with this name already exists",
            )

        article_type = write_article_type(name, definition)
        return JSONResponse(article_type, status_code=201)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create article type: {exc}",
        ) from exc


@router.put("/{article_type_id}")
async def update_article_type(article_type_id: int, request: dict) -> JSONResponse:
    """Update an existing article type by ID."""
    try:
        name = request.get("name")
        definition = request.get("definition")

        if not name or not definition:
            raise HTTPException(
                status_code=400,
                detail="Name and definition are required",
            )

        updated_article_type = update_article_type_by_id(
            article_type_id=article_type_id,
            name=name,
            definition=definition,
        )
        if not updated_article_type:
            raise HTTPException(status_code=404, detail="Article type not found")

        return JSONResponse(updated_article_type)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=409,
            detail="Article type with this name already exists",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update article type: {exc}",
        ) from exc


@router.delete("/{article_type_id}")
async def delete_article_type_endpoint(article_type_id: int) -> JSONResponse:
    """Delete an article type by ID."""
    try:
        deleted = delete_article_type(article_type_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Article type not found")
        return JSONResponse({"message": "Article type deleted successfully"})
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete article type: {exc}",
        ) from exc
