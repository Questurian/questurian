from fastapi import APIRouter, HTTPException
from lib.database import execute_query, get_db_connection

router = APIRouter(prefix="/dev", tags=["development"])


@router.delete("/clear-all", status_code=200)
def clear_all_data():
    """Clear all data from the database (for development)."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Delete all data from all tables
        cursor.execute("DELETE FROM diario_correo_posts")
        cursor.execute("DELETE FROM diario_correo_fetch_logs")
        cursor.execute("DELETE FROM diario_correo_feed_tag_map")
        cursor.execute("DELETE FROM diario_correo_feeds")
        cursor.execute("DELETE FROM youtube_posts")
        cursor.execute("DELETE FROM youtube_fetch_logs")
        cursor.execute("DELETE FROM youtube_feeds")
        cursor.execute("DELETE FROM el_comercio_posts")
        cursor.execute("DELETE FROM el_comercio_fetch_logs")
        cursor.execute("DELETE FROM el_comercio_feed_tag_map")
        cursor.execute("DELETE FROM el_comercio_feeds")
        cursor.execute("DELETE FROM reddit_feeds")
        cursor.execute("DELETE FROM instagram_posts")
        cursor.execute("DELETE FROM instagram_fetch_logs")
        cursor.execute("DELETE FROM instagram_feed_tag_map")
        cursor.execute("DELETE FROM instagram_feeds")
        cursor.execute("DELETE FROM fetch_logs")
        cursor.execute("DELETE FROM leads")
        cursor.execute("DELETE FROM feed_tag_map")
        cursor.execute("DELETE FROM feed_tags")
        cursor.execute("DELETE FROM feeds")
        cursor.execute("DELETE FROM countries")
        cursor.execute("DELETE FROM categories")

        # Reset autoincrement counters
        cursor.execute("DELETE FROM sqlite_sequence")

        conn.commit()
        conn.close()

        return {
            "message": "All data cleared successfully",
            "cleared": [
                "categories",
                "countries",
                "feeds",
                "feed_tags",
                "feed_tag_map",
                "leads",
                "fetch_logs",
                "el_comercio_feeds",
                "el_comercio_feed_tag_map",
                "el_comercio_posts",
                "el_comercio_fetch_logs",
                "diario_correo_feeds",
                "diario_correo_feed_tag_map",
                "diario_correo_posts",
                "diario_correo_fetch_logs",
                "youtube_feeds",
                "youtube_posts",
                "youtube_fetch_logs",
                "instagram_feeds",
                "instagram_feed_tag_map",
                "instagram_posts",
                "instagram_fetch_logs",
                "reddit_feeds",
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/clear-fetched", status_code=200)
def clear_fetched_data():
    """Clear only fetched data, keeping categories, feeds, tags, and feed mappings."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Delete only fetched content and logs
        cursor.execute("DELETE FROM fetch_logs")
        cursor.execute("DELETE FROM leads")
        cursor.execute("DELETE FROM el_comercio_posts")
        cursor.execute("DELETE FROM el_comercio_fetch_logs")
        cursor.execute("DELETE FROM diario_correo_posts")
        cursor.execute("DELETE FROM diario_correo_fetch_logs")
        cursor.execute("DELETE FROM youtube_posts")
        cursor.execute("DELETE FROM youtube_fetch_logs")
        cursor.execute("DELETE FROM instagram_posts")
        cursor.execute("DELETE FROM instagram_fetch_logs")

        # Reset autoincrement for these tables
        cursor.execute(
            """DELETE FROM sqlite_sequence
               WHERE name IN (
                   'leads',
                   'fetch_logs',
                   'el_comercio_posts',
                   'el_comercio_fetch_logs',
                   'diario_correo_posts',
                   'diario_correo_fetch_logs',
                   'youtube_posts',
                   'youtube_fetch_logs',
                   'instagram_posts',
                   'instagram_fetch_logs'
               )"""
        )

        conn.commit()
        conn.close()

        return {
            "message": "Fetched data cleared successfully",
            "cleared": [
                "leads",
                "fetch_logs",
                "el_comercio_posts",
                "el_comercio_fetch_logs",
                "diario_correo_posts",
                "diario_correo_fetch_logs",
                "youtube_posts",
                "youtube_fetch_logs",
                "instagram_posts",
                "instagram_fetch_logs",
            ],
            "preserved": [
                "categories",
                "countries",
                "feeds",
                "feed_tags",
                "feed_tag_map",
                "el_comercio_feeds",
                "el_comercio_feed_tag_map",
                "diario_correo_feeds",
                "diario_correo_feed_tag_map",
                "youtube_feeds",
                "instagram_feeds",
                "instagram_feed_tag_map",
                "reddit_feeds",
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
