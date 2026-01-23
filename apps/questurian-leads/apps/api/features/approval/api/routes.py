from fastapi import APIRouter, HTTPException
from typing import Optional
from lib.database import fetch_all, fetch_one, execute_query
from features.approval.schema.models import (
    ApprovalRequest, BatchApprovalRequest,
    PendingContentItem, PendingContentResponse
)
from datetime import datetime

router = APIRouter(prefix="/approval", tags=["approval"])

def auto_approve_reddit_posts() -> None:
    """Ensure Reddit posts skip the approval queue."""
    execute_query(
        """UPDATE reddit_posts
           SET approval_status = 'approved'
           WHERE approval_status IS NULL OR approval_status = 'pending'""",
        ()
    )

@router.get("/pending", response_model=PendingContentResponse)
async def get_pending_content(
    content_type: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
):
    """
    Get all pending content across all types, or filter by content_type.
    content_type can be a single type or comma-separated list of types.
    For example: content_type=lead,el_comercio_post,diario_correo_post
    Returns unified list with content_type identifier.
    """
    items = []
    content_types = content_type.split(',') if content_type else None

    if not content_types or 'reddit_post' in content_types:
        auto_approve_reddit_posts()

    # Fetch pending leads
    if not content_types or 'lead' in content_types:
        leads = fetch_all(
            """SELECT l.id,
                      COALESCE(NULLIF(l.title_translated, ''), l.title) AS title,
                      COALESCE(NULLIF(l.summary_translated, ''), l.summary) AS summary,
                      l.detected_language,
                      l.translation_status,
                      l.link, l.collected_at, l.image_url, f.source_name
               FROM leads l
               JOIN feeds f ON l.feed_id = f.id
               WHERE l.approval_status = 'pending'
               ORDER BY l.collected_at DESC
               LIMIT ? OFFSET ?""",
            (limit, offset)
        )
        items.extend([{
            'content_type': 'lead',
            'content_id': lead['id'],
            'title': lead['title'],
            'summary': lead['summary'],
            'source_name': lead['source_name'],
            'collected_at': lead['collected_at'],
            'image_url': lead['image_url'],
            'link': lead['link'],
            'detected_language': lead['detected_language'],
            'translation_status': lead['translation_status'],
        } for lead in leads])

    # Fetch pending Instagram posts
    if not content_types or 'instagram_post' in content_types:
        instagram = fetch_all(
            """SELECT ip.id,
                      COALESCE(NULLIF(ip.caption_translated, ''), ip.caption) AS caption,
                      ip.detected_language,
                      ip.translation_status,
                      COALESCE(NULLIF(ip.thumbnail_url, ''), NULLIF(ip.media_url, '')) AS image_url,
                      ip.permalink, ip.collected_at, if.username
               FROM instagram_posts ip
               JOIN instagram_feeds if ON ip.instagram_feed_id = if.id
               WHERE ip.approval_status = 'pending'
               ORDER BY ip.collected_at DESC
               LIMIT ? OFFSET ?""",
            (limit, offset)
        )
        items.extend([{
            'content_type': 'instagram_post',
            'content_id': post['id'],
            'title': post['caption'][:100] if post['caption'] else 'No caption',
            'summary': post['caption'],
            'source_name': f"@{post['username']}",
            'collected_at': post['collected_at'],
            'image_url': post['image_url'],
            'link': post['permalink'],
            'detected_language': post['detected_language'],
            'translation_status': post['translation_status'],
        } for post in instagram])

    # Fetch pending Reddit posts
    if not content_types or 'reddit_post' in content_types:
        reddit = fetch_all(
            """SELECT rp.id,
                      COALESCE(NULLIF(rp.title_translated, ''), rp.title) AS title,
                      COALESCE(NULLIF(rp.selftext_translated, ''), rp.selftext) AS selftext,
                      rp.detected_language,
                      rp.translation_status,
                      rp.permalink, rp.collected_at, rp.subreddit
               FROM reddit_posts rp
               WHERE rp.approval_status = 'pending'
               ORDER BY rp.collected_at DESC
               LIMIT ? OFFSET ?""",
            (limit, offset)
        )
        items.extend([{
            'content_type': 'reddit_post',
            'content_id': post['id'],
            'title': post['title'],
            'summary': post['selftext'][:200] if post['selftext'] else None,
            'source_name': f"r/{post['subreddit']}",
            'collected_at': post['collected_at'],
            'image_url': None,
            'link': post['permalink'],
            'detected_language': post['detected_language'],
            'translation_status': post['translation_status'],
        } for post in reddit])

    # Fetch pending El Comercio posts
    if not content_types or 'el_comercio_post' in content_types:
        el_comercio = fetch_all(
            """SELECT ecp.id,
                      COALESCE(NULLIF(ecp.title_translated, ''), ecp.title) AS title,
                      COALESCE(NULLIF(ecp.excerpt_translated, ''), ecp.excerpt) AS excerpt,
                      ecp.detected_language,
                      ecp.translation_status,
                      ecp.url, ecp.collected_at, ecp.image_url, ecf.display_name
               FROM el_comercio_posts ecp
               JOIN el_comercio_feeds ecf ON ecp.el_comercio_feed_id = ecf.id
               WHERE ecp.approval_status = 'pending'
               ORDER BY ecp.collected_at DESC
               LIMIT ? OFFSET ?""",
            (limit, offset)
        )
        items.extend([{
            'content_type': 'el_comercio_post',
            'content_id': post['id'],
            'title': post['title'],
            'summary': post['excerpt'],
            'source_name': post['display_name'],
            'collected_at': post['collected_at'],
            'image_url': post['image_url'],
            'link': post['url'],
            'detected_language': post['detected_language'],
            'translation_status': post['translation_status'],
        } for post in el_comercio])

    # Fetch pending Diario Correo posts
    if not content_types or 'diario_correo_post' in content_types:
        diario_correo = fetch_all(
            """SELECT dcp.id,
                      COALESCE(NULLIF(dcp.title_translated, ''), dcp.title) AS title,
                      COALESCE(NULLIF(dcp.excerpt_translated, ''), dcp.excerpt) AS excerpt,
                      dcp.detected_language,
                      dcp.translation_status,
                      dcp.url, dcp.collected_at, dcp.image_url, dcf.display_name
               FROM diario_correo_posts dcp
               JOIN diario_correo_feeds dcf ON dcp.diario_correo_feed_id = dcf.id
               WHERE dcp.approval_status = 'pending'
               ORDER BY dcp.collected_at DESC
               LIMIT ? OFFSET ?""",
            (limit, offset)
        )
        items.extend([{
            'content_type': 'diario_correo_post',
            'content_id': post['id'],
            'title': post['title'],
            'summary': post['excerpt'],
            'source_name': post['display_name'],
            'collected_at': post['collected_at'],
            'image_url': post['image_url'],
            'link': post['url'],
            'detected_language': post['detected_language'],
            'translation_status': post['translation_status'],
        } for post in diario_correo])

    # Sort all items by collected_at descending
    items.sort(key=lambda x: x['collected_at'], reverse=True)

    return {
        'total_count': len(items),
        'items': items[:limit]
    }

@router.post("/approve")
async def approve_content(request: ApprovalRequest):
    """Approve or reject a single content item."""
    table_map = {
        'lead': 'leads',
        'instagram_post': 'instagram_posts',
        'reddit_post': 'reddit_posts',
        'el_comercio_post': 'el_comercio_posts',
        'diario_correo_post': 'diario_correo_posts'
    }

    table = table_map.get(request.content_type)
    if not table:
        raise HTTPException(400, f"Invalid content_type: {request.content_type}")

    execute_query(
        f"""UPDATE {table}
           SET approval_status = ?,
               approved_by = ?,
               approved_at = ?,
               approval_notes = ?
           WHERE id = ?""",
        (request.status, request.approved_by,
         datetime.utcnow().isoformat(), request.approval_notes,
         request.content_id)
    )

    return {"message": f"Content {request.status}", "content_id": request.content_id}

@router.post("/approve/batch")
async def batch_approve_content(request: BatchApprovalRequest):
    """Approve or reject multiple content items at once."""
    results = []

    for item in request.items:
        try:
            table_map = {
                'lead': 'leads',
                'instagram_post': 'instagram_posts',
                'reddit_post': 'reddit_posts',
                'el_comercio_post': 'el_comercio_posts',
                'diario_correo_post': 'diario_correo_posts'
            }

            table = table_map.get(item.content_type)
            if not table:
                results.append({
                    'content_id': item.content_id,
                    'success': False,
                    'error': f"Invalid content_type: {item.content_type}"
                })
                continue

            execute_query(
                f"""UPDATE {table}
                   SET approval_status = ?,
                       approved_by = ?,
                       approved_at = ?,
                       approval_notes = ?
                   WHERE id = ?""",
                (item.status, item.approved_by,
                 datetime.utcnow().isoformat(), item.approval_notes,
                 item.content_id)
            )

            results.append({
                'content_id': item.content_id,
                'success': True
            })
        except Exception as e:
            results.append({
                'content_id': item.content_id,
                'success': False,
                'error': str(e)
            })

    return {
        'total': len(request.items),
        'successful': sum(1 for r in results if r['success']),
        'failed': sum(1 for r in results if not r['success']),
        'results': results
    }

@router.get("/stats")
async def get_approval_stats():
    """Get counts of pending/approved/rejected items by type."""
    auto_approve_reddit_posts()
    stats = {}
    tables = {
        'leads': 'lead',
        'instagram_posts': 'instagram_post',
        'reddit_posts': 'reddit_post',
        'el_comercio_posts': 'el_comercio_post',
        'diario_correo_posts': 'diario_correo_post'
    }

    for table, content_type in tables.items():
        pending = fetch_one(
            f"SELECT COUNT(*) as count FROM {table} WHERE approval_status = 'pending'",
            ()
        )
        approved = fetch_one(
            f"SELECT COUNT(*) as count FROM {table} WHERE approval_status = 'approved'",
            ()
        )
        rejected = fetch_one(
            f"SELECT COUNT(*) as count FROM {table} WHERE approval_status = 'rejected'",
            ()
        )

        stats[content_type] = {
            'pending': pending['count'] if pending else 0,
            'approved': approved['count'] if approved else 0,
            'rejected': rejected['count'] if rejected else 0
        }

    return stats
