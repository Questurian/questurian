"""
Unified API routes for scraped content across sources.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, Tuple

from lib.database import fetch_all, fetch_one
from features.scrapes.schema.models import ScrapeResponse

router = APIRouter(prefix="/scrapes", tags=["scrapes"])

CONTENT_TYPES = ("el_comercio_post", "diario_correo_post")


def build_where_clause(
    alias: str,
    search: Optional[str],
    approval_status: Optional[str],
    country: Optional[str],
) -> Tuple[str, list]:
    clauses = []
    params = []

    if approval_status:
        clauses.append(f"{alias}.approval_status = ?")
        params.append(approval_status)

    if search:
        term = f"%{search}%"
        clauses.append(
            f"({alias}.title LIKE ? OR {alias}.title_translated LIKE ? "
            f"OR {alias}.excerpt LIKE ? OR {alias}.excerpt_translated LIKE ?)"
        )
        params.extend([term, term, term, term])

    if country:
        clauses.append(f"{alias}.country = ?")
        params.append(country)

    if clauses:
        return " AND " + " AND ".join(clauses), params
    return "", params


def build_el_comercio_queries(
    search: Optional[str],
    approval_status: Optional[str],
    country: Optional[str],
) -> Tuple[str, list, str, list]:
    where_sql, params = build_where_clause("ecp", search, approval_status, country)
    select_sql = f"""
        SELECT
            'el_comercio_post' AS content_type,
            ecp.id AS content_id,
            COALESCE(NULLIF(ecp.title_translated, ''), ecp.title) AS title,
            COALESCE(NULLIF(ecp.excerpt_translated, ''), ecp.excerpt) AS summary,
            ecf.display_name AS source_name,
            ecp.collected_at AS collected_at,
            ecp.country AS country,
            ecp.image_url AS image_url,
            ecp.url AS link,
            ecp.detected_language AS detected_language,
            ecp.translation_status AS translation_status,
            ecp.approval_status AS approval_status
        FROM el_comercio_posts ecp
        JOIN el_comercio_feeds ecf ON ecp.el_comercio_feed_id = ecf.id
        WHERE 1=1{where_sql}
    """
    count_sql = f"""
        SELECT COUNT(*) AS count
        FROM el_comercio_posts ecp
        WHERE 1=1{where_sql}
    """
    return select_sql, list(params), count_sql, list(params)


def build_diario_correo_queries(
    search: Optional[str],
    approval_status: Optional[str],
    country: Optional[str],
) -> Tuple[str, list, str, list]:
    where_sql, params = build_where_clause("dcp", search, approval_status, country)
    select_sql = f"""
        SELECT
            'diario_correo_post' AS content_type,
            dcp.id AS content_id,
            COALESCE(NULLIF(dcp.title_translated, ''), dcp.title) AS title,
            COALESCE(NULLIF(dcp.excerpt_translated, ''), dcp.excerpt) AS summary,
            dcf.display_name AS source_name,
            dcp.collected_at AS collected_at,
            dcp.country AS country,
            dcp.image_url AS image_url,
            dcp.url AS link,
            dcp.detected_language AS detected_language,
            dcp.translation_status AS translation_status,
            dcp.approval_status AS approval_status
        FROM diario_correo_posts dcp
        JOIN diario_correo_feeds dcf ON dcp.diario_correo_feed_id = dcf.id
        WHERE 1=1{where_sql}
    """
    count_sql = f"""
        SELECT COUNT(*) AS count
        FROM diario_correo_posts dcp
        WHERE 1=1{where_sql}
    """
    return select_sql, list(params), count_sql, list(params)


@router.get("", response_model=ScrapeResponse)
def get_scrapes(
    content_type: Optional[str] = Query(None),
    approval_status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """
    Get scraped content across sources.
    """
    if content_type and content_type not in CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid content_type")

    query_parts = []
    params = []
    total_count = 0

    if content_type in (None, "el_comercio_post"):
        select_sql, select_params, count_sql, count_params = build_el_comercio_queries(
            search, approval_status, country
        )
        query_parts.append(select_sql)
        params.extend(select_params)
        count_row = fetch_one(count_sql, tuple(count_params))
        total_count += count_row["count"] if count_row else 0

    if content_type in (None, "diario_correo_post"):
        select_sql, select_params, count_sql, count_params = build_diario_correo_queries(
            search, approval_status, country
        )
        query_parts.append(select_sql)
        params.extend(select_params)
        count_row = fetch_one(count_sql, tuple(count_params))
        total_count += count_row["count"] if count_row else 0

    if not query_parts:
        return {"total_count": 0, "items": []}

    union_sql = " UNION ALL ".join(query_parts)
    final_sql = f"""
        SELECT *
        FROM ({union_sql})
        ORDER BY collected_at DESC
        LIMIT ? OFFSET ?
    """
    params.extend([limit, offset])
    items = fetch_all(final_sql, tuple(params))

    return {
        "total_count": total_count,
        "items": items,
    }
