"""
Shared article types API routes.
"""
import sqlite3

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

router = APIRouter(prefix="/article-types", tags=["article-types"])


@router.get("")
async def get_article_types() -> JSONResponse:
    """Get all article types with their definitions."""
    try:
        article_types = read_article_types()
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
