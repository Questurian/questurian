from fastapi import APIRouter, HTTPException
from typing import List

from features.tags.schema import TagCreate, TagUpdate, TagResponse, FeedTagsUpdate
from lib.database import fetch_all, fetch_one, execute_query, get_db_connection

router = APIRouter(prefix="/tags", tags=["tags"])


@router.post("", response_model=TagResponse, status_code=201)
def create_tag(tag: TagCreate) -> TagResponse:
    """Create a new tag."""
    try:
        tag_id = execute_query(
            "INSERT INTO feed_tags (name) VALUES (?)",
            (tag.name,)
        )
        result = fetch_one("SELECT * FROM feed_tags WHERE id = ?", (tag_id,))
        if not result:
            raise HTTPException(status_code=500, detail="Failed to create tag")
        return TagResponse(**result)
    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=400, detail="Tag name already exists")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=List[TagResponse])
def get_tags() -> List[TagResponse]:
    """Get all tags."""
    results = fetch_all("SELECT * FROM feed_tags ORDER BY name")
    return [TagResponse(**row) for row in results]


@router.get("/{tag_id}", response_model=TagResponse)
def get_tag(tag_id: int) -> TagResponse:
    """Get a tag by ID."""
    result = fetch_one("SELECT * FROM feed_tags WHERE id = ?", (tag_id,))
    if not result:
        raise HTTPException(status_code=404, detail="Tag not found")
    return TagResponse(**result)


@router.put("/{tag_id}", response_model=TagResponse)
def update_tag(tag_id: int, tag: TagUpdate) -> TagResponse:
    """Update a tag name."""
    existing = fetch_one("SELECT * FROM feed_tags WHERE id = ?", (tag_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Tag not found")

    try:
        execute_query("UPDATE feed_tags SET name = ? WHERE id = ?", (tag.name, tag_id))
        result = fetch_one("SELECT * FROM feed_tags WHERE id = ?", (tag_id,))
        return TagResponse(**result)
    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=400, detail="Tag name already exists")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{tag_id}", status_code=204)
def delete_tag(tag_id: int):
    """Delete a tag. Cascades to remove all feed-tag mappings."""
    existing = fetch_one("SELECT * FROM feed_tags WHERE id = ?", (tag_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Tag not found")

    execute_query("DELETE FROM feed_tags WHERE id = ?", (tag_id,))


# Feed-Tag mapping routes
@router.post("/feeds/{feed_id}/tags/{tag_id}", status_code=201)
def add_tag_to_feed(feed_id: int, tag_id: int):
    """Add a tag to a feed."""
    # Validate feed exists
    feed = fetch_one("SELECT * FROM feeds WHERE id = ?", (feed_id,))
    if not feed:
        raise HTTPException(status_code=404, detail="Feed not found")

    # Validate tag exists
    tag = fetch_one("SELECT * FROM feed_tags WHERE id = ?", (tag_id,))
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    # Check if mapping already exists
    existing = fetch_one(
        "SELECT * FROM feed_tag_map WHERE feed_id = ? AND tag_id = ?",
        (feed_id, tag_id)
    )
    if existing:
        raise HTTPException(status_code=400, detail="Tag already associated with feed")

    try:
        execute_query(
            "INSERT INTO feed_tag_map (feed_id, tag_id) VALUES (?, ?)",
            (feed_id, tag_id)
        )
        return {"message": "Tag added to feed successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/feeds/{feed_id}/tags", response_model=List[TagResponse])
def get_feed_tags(feed_id: int) -> List[TagResponse]:
    """Get all tags for a feed."""
    # Validate feed exists
    feed = fetch_one("SELECT * FROM feeds WHERE id = ?", (feed_id,))
    if not feed:
        raise HTTPException(status_code=404, detail="Feed not found")

    tags = fetch_all(
        """SELECT ft.* FROM feed_tags ft
           JOIN feed_tag_map ftm ON ft.id = ftm.tag_id
           WHERE ftm.feed_id = ?
           ORDER BY ft.name""",
        (feed_id,)
    )
    return [TagResponse(**tag) for tag in tags]


@router.delete("/feeds/{feed_id}/tags/{tag_id}", status_code=204)
def remove_tag_from_feed(feed_id: int, tag_id: int):
    """Remove a tag from a feed."""
    existing = fetch_one(
        "SELECT * FROM feed_tag_map WHERE feed_id = ? AND tag_id = ?",
        (feed_id, tag_id)
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Tag not associated with feed")

    execute_query(
        "DELETE FROM feed_tag_map WHERE feed_id = ? AND tag_id = ?",
        (feed_id, tag_id)
    )


@router.put("/feeds/{feed_id}/tags", response_model=List[TagResponse])
def update_feed_tags(feed_id: int, data: FeedTagsUpdate) -> List[TagResponse]:
    """Bulk replace all tags for a feed."""
    # Validate feed exists
    feed = fetch_one("SELECT * FROM feeds WHERE id = ?", (feed_id,))
    if not feed:
        raise HTTPException(status_code=404, detail="Feed not found")

    # Validate all tags exist
    for tag_id in data.tags:
        tag = fetch_one("SELECT * FROM feed_tags WHERE id = ?", (tag_id,))
        if not tag:
            raise HTTPException(status_code=400, detail=f"Tag {tag_id} not found")

    # Remove all existing tags
    execute_query("DELETE FROM feed_tag_map WHERE feed_id = ?", (feed_id,))

    # Add new tags
    if data.tags:
        conn = get_db_connection()
        cursor = conn.cursor()
        for tag_id in data.tags:
            cursor.execute(
                "INSERT INTO feed_tag_map (feed_id, tag_id) VALUES (?, ?)",
                (feed_id, tag_id)
            )
        conn.commit()
        conn.close()

    # Return updated tags
    tags = fetch_all(
        """SELECT ft.* FROM feed_tags ft
           JOIN feed_tag_map ftm ON ft.id = ftm.tag_id
           WHERE ftm.feed_id = ?
           ORDER BY ft.name""",
        (feed_id,)
    )
    return [TagResponse(**tag) for tag in tags]
