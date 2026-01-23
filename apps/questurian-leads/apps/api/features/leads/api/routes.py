from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional

from features.leads.schema import LeadCreate, LeadUpdate, LeadResponse
from lib.database import fetch_all, fetch_one, execute_query

router = APIRouter(prefix="/leads", tags=["leads"])


@router.post("", response_model=LeadResponse, status_code=201)
def create_lead(lead: LeadCreate) -> LeadResponse:
    """Create a new lead."""
    # Validate feed exists
    feed = fetch_one("SELECT * FROM feeds WHERE id = ?", (lead.feed_id,))
    if not feed:
        raise HTTPException(status_code=400, detail="Feed not found")

    try:
        lead_id = execute_query(
            """INSERT INTO leads
               (feed_id, guid, title, link, country, author, summary, content, published)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (lead.feed_id, lead.guid, lead.title, lead.link, lead.country,
             lead.author, lead.summary, lead.content, lead.published)
        )
        result = fetch_one("SELECT * FROM leads WHERE id = ?", (lead_id,))
        if not result:
            raise HTTPException(status_code=500, detail="Failed to create lead")
        return LeadResponse(**result)
    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=400, detail="Lead GUID already exists")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=List[LeadResponse])
def get_leads(
    feed_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    sort: Optional[str] = Query("published", regex="^(published|collected_at)$"),
    limit: Optional[int] = Query(100, ge=1, le=1000),
    offset: Optional[int] = Query(0, ge=0)
) -> List[LeadResponse]:
    """Get all leads with optional filters."""
    query = "SELECT DISTINCT l.* FROM leads l"
    joins = []
    conditions = []
    params = []

    if category:
        joins.append("JOIN feeds f ON l.feed_id = f.id")
        joins.append("JOIN categories c ON f.category_id = c.id")
        conditions.append("c.name = ?")
        params.append(category)

    if tag:
        joins.append("JOIN feeds f ON l.feed_id = f.id")
        joins.append("JOIN feed_tag_map ftm ON f.id = ftm.feed_id")
        joins.append("JOIN feed_tags ft ON ftm.tag_id = ft.id")
        conditions.append("ft.name = ?")
        params.append(tag)

    if feed_id is not None:
        conditions.append("l.feed_id = ?")
        params.append(feed_id)

    if search:
        conditions.append("(l.title LIKE ? OR l.summary LIKE ? OR l.content LIKE ?)")
        search_param = f"%{search}%"
        params.extend([search_param, search_param, search_param])

    if country:
        conditions.append("l.country = ?")
        params.append(country)

    # Always filter by approved status
    conditions.append("l.approval_status = 'approved'")

    if joins:
        query += " " + " ".join(set(joins))

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += f" ORDER BY l.{sort} DESC"
    query += " LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    results = fetch_all(query, tuple(params))
    return [LeadResponse(**row) for row in results]


@router.get("/feed/{feed_id}", response_model=List[LeadResponse])
def get_leads_by_feed(
    feed_id: int,
    limit: Optional[int] = Query(100, ge=1, le=1000),
    offset: Optional[int] = Query(0, ge=0)
) -> List[LeadResponse]:
    """Get all leads for a specific feed."""
    feed = fetch_one("SELECT * FROM feeds WHERE id = ?", (feed_id,))
    if not feed:
        raise HTTPException(status_code=404, detail="Feed not found")

    leads = fetch_all(
        "SELECT * FROM leads WHERE feed_id = ? AND approval_status = 'approved' ORDER BY published DESC LIMIT ? OFFSET ?",
        (feed_id, limit, offset)
    )
    return [LeadResponse(**lead) for lead in leads]


@router.get("/tag/{tag_name}", response_model=List[LeadResponse])
def get_leads_by_tag(
    tag_name: str,
    limit: Optional[int] = Query(100, ge=1, le=1000),
    offset: Optional[int] = Query(0, ge=0)
) -> List[LeadResponse]:
    """Get all leads that match a specific tag."""
    leads = fetch_all(
        """SELECT DISTINCT l.* FROM leads l
           JOIN feeds f ON l.feed_id = f.id
           JOIN feed_tag_map ftm ON f.id = ftm.feed_id
           JOIN feed_tags ft ON ftm.tag_id = ft.id
           WHERE ft.name = ? AND l.approval_status = 'approved'
           ORDER BY l.published DESC
           LIMIT ? OFFSET ?""",
        (tag_name, limit, offset)
    )
    return [LeadResponse(**lead) for lead in leads]


@router.get("/category/{category_name}", response_model=List[LeadResponse])
def get_leads_by_category(
    category_name: str,
    limit: Optional[int] = Query(100, ge=1, le=1000),
    offset: Optional[int] = Query(0, ge=0)
) -> List[LeadResponse]:
    """Get all leads from feeds in a specific category."""
    leads = fetch_all(
        """SELECT l.* FROM leads l
           JOIN feeds f ON l.feed_id = f.id
           JOIN categories c ON f.category_id = c.id
           WHERE c.name = ? AND l.approval_status = 'approved'
           ORDER BY l.published DESC
           LIMIT ? OFFSET ?""",
        (category_name, limit, offset)
    )
    return [LeadResponse(**lead) for lead in leads]


@router.get("/{lead_id}", response_model=LeadResponse)
def get_lead(lead_id: int) -> LeadResponse:
    """Get a lead by ID."""
    result = fetch_one("SELECT * FROM leads WHERE id = ?", (lead_id,))
    if not result:
        raise HTTPException(status_code=404, detail="Lead not found")
    return LeadResponse(**result)


@router.put("/{lead_id}", response_model=LeadResponse)
def update_lead(lead_id: int, lead: LeadUpdate) -> LeadResponse:
    """Update a lead."""
    existing = fetch_one("SELECT * FROM leads WHERE id = ?", (lead_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Lead not found")

    updates = []
    params = []

    if lead.guid is not None:
        updates.append("guid = ?")
        params.append(lead.guid)
    if lead.title is not None:
        updates.append("title = ?")
        params.append(lead.title)
    if lead.link is not None:
        updates.append("link = ?")
        params.append(lead.link)
    if lead.country is not None:
        updates.append("country = ?")
        params.append(lead.country)
    if lead.author is not None:
        updates.append("author = ?")
        params.append(lead.author)
    if lead.summary is not None:
        updates.append("summary = ?")
        params.append(lead.summary)
    if lead.content is not None:
        updates.append("content = ?")
        params.append(lead.content)
    if lead.published is not None:
        updates.append("published = ?")
        params.append(lead.published)

    if not updates:
        return LeadResponse(**existing)

    params.append(lead_id)
    query = f"UPDATE leads SET {', '.join(updates)} WHERE id = ?"

    try:
        execute_query(query, tuple(params))
        result = fetch_one("SELECT * FROM leads WHERE id = ?", (lead_id,))
        return LeadResponse(**result)
    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=400, detail="Lead GUID already exists")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{lead_id}", status_code=204)
def delete_lead(lead_id: int):
    """Delete a lead permanently."""
    existing = fetch_one("SELECT * FROM leads WHERE id = ?", (lead_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Lead not found")

    execute_query("DELETE FROM leads WHERE id = ?", (lead_id,))
