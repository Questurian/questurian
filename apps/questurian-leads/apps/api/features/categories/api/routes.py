from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional

from features.categories.schema import CategoryCreate, CategoryUpdate, CategoryResponse
from lib.database import fetch_all, fetch_one, execute_query, get_db_connection

router = APIRouter(prefix="/categories", tags=["categories"])


@router.post("", response_model=CategoryResponse, status_code=201)
def create_category(category: CategoryCreate) -> CategoryResponse:
    """Create a new category."""
    try:
        category_id = execute_query(
            "INSERT INTO categories (name) VALUES (?)",
            (category.name,)
        )
        result = fetch_one("SELECT * FROM categories WHERE id = ?", (category_id,))
        if not result:
            raise HTTPException(status_code=500, detail="Failed to create category")
        return CategoryResponse(**result)
    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=400, detail="Category name already exists")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=List[CategoryResponse])
def get_categories(
    limit: Optional[int] = Query(None, ge=1),
    offset: Optional[int] = Query(0, ge=0)
) -> List[CategoryResponse]:
    """Get all categories."""
    query = "SELECT * FROM categories"
    params = []

    if limit is not None:
        query += f" LIMIT ? OFFSET ?"
        params = [limit, offset]

    results = fetch_all(query, tuple(params))
    return [CategoryResponse(**row) for row in results]


@router.get("/{category_id}", response_model=CategoryResponse)
def get_category(category_id: int) -> CategoryResponse:
    """Get a category by ID."""
    result = fetch_one("SELECT * FROM categories WHERE id = ?", (category_id,))
    if not result:
        raise HTTPException(status_code=404, detail="Category not found")
    return CategoryResponse(**result)


@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(category_id: int, category: CategoryUpdate) -> CategoryResponse:
    """Update a category."""
    existing = fetch_one("SELECT * FROM categories WHERE id = ?", (category_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")

    if category.name is None:
        return CategoryResponse(**existing)

    try:
        execute_query(
            "UPDATE categories SET name = ? WHERE id = ?",
            (category.name, category_id)
        )
        result = fetch_one("SELECT * FROM categories WHERE id = ?", (category_id,))
        return CategoryResponse(**result)
    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=400, detail="Category name already exists")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: int):
    """Delete a category. Fails if feeds exist for this category."""
    existing = fetch_one("SELECT * FROM categories WHERE id = ?", (category_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")

    # Check if feeds exist
    feeds = fetch_all("SELECT * FROM feeds WHERE category_id = ?", (category_id,))
    if feeds:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete category with {len(feeds)} associated feeds"
        )

    execute_query("DELETE FROM categories WHERE id = ?", (category_id,))
