from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional

from features.countries.schema import CountryCreate, CountryUpdate, CountryResponse
from lib.database import fetch_all, fetch_one, execute_query

router = APIRouter(prefix="/countries", tags=["countries"])


@router.post("", response_model=CountryResponse, status_code=201)
def create_country(country: CountryCreate) -> CountryResponse:
    """Create a new country."""
    try:
        country_id = execute_query(
            "INSERT INTO countries (name) VALUES (?)",
            (country.name,)
        )
        result = fetch_one("SELECT * FROM countries WHERE id = ?", (country_id,))
        if not result:
            raise HTTPException(status_code=500, detail="Failed to create country")
        return CountryResponse(**result)
    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=400, detail="Country name already exists")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=List[CountryResponse])
def get_countries(
    limit: Optional[int] = Query(None, ge=1),
    offset: Optional[int] = Query(0, ge=0)
) -> List[CountryResponse]:
    """Get all countries."""
    query = "SELECT * FROM countries ORDER BY name"
    params = []

    if limit is not None:
        query += " LIMIT ? OFFSET ?"
        params = [limit, offset]

    results = fetch_all(query, tuple(params))
    return [CountryResponse(**row) for row in results]


@router.get("/{country_id}", response_model=CountryResponse)
def get_country(country_id: int) -> CountryResponse:
    """Get a country by ID."""
    result = fetch_one("SELECT * FROM countries WHERE id = ?", (country_id,))
    if not result:
        raise HTTPException(status_code=404, detail="Country not found")
    return CountryResponse(**result)


@router.put("/{country_id}", response_model=CountryResponse)
def update_country(country_id: int, country: CountryUpdate) -> CountryResponse:
    """Update a country name."""
    existing = fetch_one("SELECT * FROM countries WHERE id = ?", (country_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Country not found")

    if country.name is None:
        return CountryResponse(**existing)

    try:
        execute_query("UPDATE countries SET name = ? WHERE id = ?", (country.name, country_id))
        result = fetch_one("SELECT * FROM countries WHERE id = ?", (country_id,))
        return CountryResponse(**result)
    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=400, detail="Country name already exists")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{country_id}", status_code=204)
def delete_country(country_id: int):
    """Delete a country. Fails if feeds exist for this country."""
    existing = fetch_one("SELECT * FROM countries WHERE id = ?", (country_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Country not found")

    country_name = existing["name"]
    feed_counts = [
        fetch_one("SELECT COUNT(*) as count FROM feeds WHERE country = ?", (country_name,)),
        fetch_one("SELECT COUNT(*) as count FROM instagram_feeds WHERE country = ?", (country_name,)),
        fetch_one("SELECT COUNT(*) as count FROM youtube_feeds WHERE country = ?", (country_name,)),
    ]
    total = sum(row["count"] for row in feed_counts if row)
    if total:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete country with {total} associated feeds"
        )

    execute_query("DELETE FROM countries WHERE id = ?", (country_id,))
