from datetime import datetime
from typing import Dict, List
from features.feed.service.parser import parse_feed
from lib.database import fetch_one, execute_query
from utils.html_cleaning import clean_feed_content
from features.translation.service.translator import get_translator


def fetch_feed(feed_id: int) -> Dict:
    """
    Fetch RSS feed and create leads.
    Returns a dict with status, lead_count, and error_message.
    """
    feed = fetch_one("SELECT * FROM feeds WHERE id = ?", (feed_id,))
    if not feed:
        raise ValueError(f"Feed {feed_id} not found")
    feed_country = (feed.get("country") or "").strip()
    if not feed_country:
        raise ValueError("Feed country is required. Set country on the feed before fetching.")

    try:
        # Parse the RSS feed
        feed_data = parse_feed(feed["url"])

        # Get translator for language detection
        translator = get_translator()

        lead_count = 0
        errors = []

        # Create leads from entries
        for entry in feed_data.entries:
            try:
                # Check if lead already exists
                existing = fetch_one(
                    "SELECT id FROM leads WHERE feed_id = ? AND guid = ?",
                    (feed_id, entry.id)
                )

                if not existing:
                    # Clean HTML from summary and content before storing
                    clean_summary = clean_feed_content(entry.summary)
                    clean_content = clean_feed_content(entry.content)

                    # Detect language immediately - use longest available text for accuracy
                    # Prefer summary > content > title (more text = better detection)
                    text_for_detection = clean_summary or clean_content or entry.title
                    detected_language = translator.detect_language(text_for_detection)

                    # Auto-translate if not English
                    title_translated = None
                    summary_translated = None
                    content_translated = None
                    translation_status = 'already_english'
                    translated_at = None

                    if detected_language and detected_language != 'en':
                        # Translate title
                        if entry.title:
                            title_translated, title_status = translator.translate_text(entry.title, source=detected_language, target='en')

                        # Translate summary
                        if clean_summary:
                            summary_translated, summary_status = translator.translate_text(clean_summary, source=detected_language, target='en')

                        # Translate content
                        if clean_content:
                            content_translated, content_status = translator.translate_text(clean_content, source=detected_language, target='en')

                        translation_status = 'translated'
                        translated_at = datetime.utcnow().isoformat()

                    execute_query(
                        """INSERT INTO leads
                           (feed_id, guid, title, link, country, author, summary, content, published,
                            detected_language, translation_status, image_url, approval_status,
                            title_translated, summary_translated, content_translated, translated_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (feed_id, entry.id, entry.title, entry.link, feed_country, entry.author,
                         clean_summary, clean_content, entry.published,
                         detected_language, translation_status, entry.image_url, 'pending',
                         title_translated, summary_translated, content_translated, translated_at)
                    )
                    lead_count += 1
                elif entry.image_url:
                    execute_query(
                        """UPDATE leads
                           SET image_url = ?
                           WHERE feed_id = ? AND guid = ?
                             AND (image_url IS NULL OR image_url = '')""",
                        (entry.image_url, feed_id, entry.id)
                    )
            except Exception as e:
                errors.append(f"Entry '{entry.title}': {str(e)}")

        # Update last_fetched timestamp
        execute_query(
            "UPDATE feeds SET last_fetched = ? WHERE id = ?",
            (datetime.utcnow().isoformat(), feed_id)
        )

        # Create fetch log
        status = "SUCCESS" if not errors else "FAILED"
        error_message = "; ".join(errors) if errors else None

        log_id = execute_query(
            """INSERT INTO fetch_logs
               (feed_id, status, lead_count, error_message)
               VALUES (?, ?, ?, ?)""",
            (feed_id, status, lead_count, error_message)
        )

        return {
            "log_id": log_id,
            "status": status,
            "lead_count": lead_count,
            "error_message": error_message
        }

    except Exception as e:
        # Create failed fetch log
        error_message = str(e)
        log_id = execute_query(
            """INSERT INTO fetch_logs
               (feed_id, status, lead_count, error_message)
               VALUES (?, ?, ?, ?)""",
            (feed_id, "FAILED", 0, error_message)
        )

        return {
            "log_id": log_id,
            "status": "FAILED",
            "lead_count": 0,
            "error_message": error_message
        }


def fetch_all_active_feeds() -> List[Dict]:
    """
    Fetch all active feeds.
    Returns a list of fetch results.
    """
    from lib.database import fetch_all

    feeds = fetch_all("SELECT id FROM feeds WHERE is_active = 1", ())
    results = []

    for feed in feeds:
        try:
            result = fetch_feed(feed["id"])
            results.append({
                "feed_id": feed["id"],
                **result
            })
        except Exception as e:
            results.append({
                "feed_id": feed["id"],
                "status": "FAILED",
                "lead_count": 0,
                "error_message": str(e)
            })

    return results
