from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional

from features.subreddits.schema import SubredditCreate, SubredditUpdate, SubredditResponse
from lib.database import fetch_all, fetch_one, execute_query
from utils.validation import InvalidSubredditError, validate_subreddit

router = APIRouter(prefix="/subreddits", tags=["subreddits"])


@router.post("", response_model=SubredditResponse, status_code=201)
def create_subreddit(subreddit: SubredditCreate) -> SubredditResponse:
    """Create a new subreddit entry."""
    category = fetch_one("SELECT * FROM categories WHERE id = ?", (subreddit.category_id,))
    if not category:
        raise HTTPException(status_code=400, detail="Category not found")

    try:
        normalized = validate_subreddit(subreddit.subreddit)
    except InvalidSubredditError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        subreddit_id = execute_query(
            """INSERT INTO reddit_feeds
               (category_id, subreddit, display_name, description)
               VALUES (?, ?, ?, ?)""",
            (subreddit.category_id, normalized, subreddit.display_name, subreddit.description),
        )
        result = fetch_one("SELECT * FROM reddit_feeds WHERE id = ?", (subreddit_id,))
        if not result:
            raise HTTPException(status_code=500, detail="Failed to create subreddit")
        return SubredditResponse(**result)
    except Exception as exc:
        if "UNIQUE constraint failed" in str(exc):
            raise HTTPException(status_code=400, detail="Subreddit already exists")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("", response_model=List[SubredditResponse])
def get_subreddits(
    category_id: Optional[int] = Query(None),
    limit: Optional[int] = Query(None, ge=1),
    offset: Optional[int] = Query(0, ge=0),
) -> List[SubredditResponse]:
    """Get all subreddits with optional filters."""
    query = "SELECT * FROM reddit_feeds WHERE 1=1"
    params = []

    if category_id is not None:
        query += " AND category_id = ?"
        params.append(category_id)

    query += " ORDER BY display_name"

    if limit is not None:
        query += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])

    results = fetch_all(query, tuple(params))
    return [SubredditResponse(**row) for row in results]


@router.get("/{subreddit_id}", response_model=SubredditResponse)
def get_subreddit(subreddit_id: int) -> SubredditResponse:
    """Get a single subreddit by ID."""
    result = fetch_one("SELECT * FROM reddit_feeds WHERE id = ?", (subreddit_id,))
    if not result:
        raise HTTPException(status_code=404, detail="Subreddit not found")
    return SubredditResponse(**result)


@router.put("/{subreddit_id}", response_model=SubredditResponse)
def update_subreddit(subreddit_id: int, subreddit: SubredditUpdate) -> SubredditResponse:
    """Update a subreddit."""
    existing = fetch_one("SELECT * FROM reddit_feeds WHERE id = ?", (subreddit_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Subreddit not found")

    if subreddit.category_id is not None:
        category = fetch_one("SELECT * FROM categories WHERE id = ?", (subreddit.category_id,))
        if not category:
            raise HTTPException(status_code=400, detail="Category not found")

    updates = []
    params = []

    if subreddit.category_id is not None:
        updates.append("category_id = ?")
        params.append(subreddit.category_id)
    if subreddit.subreddit is not None:
        try:
            normalized = validate_subreddit(subreddit.subreddit)
        except InvalidSubredditError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        updates.append("subreddit = ?")
        params.append(normalized)
    if subreddit.display_name is not None:
        updates.append("display_name = ?")
        params.append(subreddit.display_name)
    if subreddit.description is not None:
        updates.append("description = ?")
        params.append(subreddit.description)

    if not updates:
        return SubredditResponse(**existing)

    params.append(subreddit_id)
    query = f"UPDATE reddit_feeds SET {', '.join(updates)} WHERE id = ?"

    try:
        execute_query(query, tuple(params))
        result = fetch_one("SELECT * FROM reddit_feeds WHERE id = ?", (subreddit_id,))
        return SubredditResponse(**result)
    except Exception as exc:
        if "UNIQUE constraint failed" in str(exc):
            raise HTTPException(status_code=400, detail="Subreddit already exists")
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/{subreddit_id}", status_code=204)
def delete_subreddit(subreddit_id: int):
    """Delete a subreddit."""
    existing = fetch_one("SELECT * FROM reddit_feeds WHERE id = ?", (subreddit_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Subreddit not found")

    execute_query("DELETE FROM reddit_feeds WHERE id = ?", (subreddit_id,))
