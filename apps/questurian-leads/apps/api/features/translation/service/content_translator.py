from datetime import datetime
from typing import Dict, Optional
from lib.database.db import fetch_all, fetch_one, execute_query
from .translator import get_translator


class ContentTranslator:
    """Business logic for translating content across all data sources."""

    def __init__(self):
        self.translator = get_translator()

    def translate_leads(self, feed_id: Optional[int] = None, limit: Optional[int] = None) -> Dict:
        """
        Translate RSS leads (title, summary, content).

        Args:
            feed_id: Optional feed_id to filter by
            limit: Maximum number of leads to translate

        Returns:
            Dict with translation statistics
        """
        # Build query to get untranslated leads - include detected_language
        query = """
            SELECT id, title, summary, content, detected_language
            FROM leads
            WHERE (translation_status IS NULL OR translation_status = 'pending')
        """
        params = []

        if feed_id:
            query += " AND feed_id = ?"
            params.append(feed_id)

        if limit:
            query += " LIMIT ?"
            params.append(limit)

        leads = fetch_all(query, tuple(params))

        stats = {
            "total": len(leads),
            "translated": 0,
            "already_english": 0,
            "errors": 0,
            "skipped": 0
        }

        for lead in leads:
            try:
                # Get stored detected language, or detect if missing (for backward compatibility)
                detected_lang = lead.get("detected_language")
                if not detected_lang:
                    detected_lang = self.translator.detect_language(lead.get("title", ""))

                # Use explicit source language for more accurate translation (not auto-detect)
                source_lang = detected_lang if detected_lang and detected_lang != "en" else "auto"

                # Translate title
                title_result, title_status = self.translator.translate_text(
                    lead.get("title", ""),
                    source=source_lang
                )

                # Translate summary
                summary_result, summary_status = self.translator.translate_text(
                    lead.get("summary") or "",
                    source=source_lang
                )

                # Translate content
                content_result, content_status = self.translator.translate_text(
                    lead.get("content") or "",
                    source=source_lang
                )

                # Determine overall status based on actual translation results
                # If ANY field was translated, mark the whole lead as translated
                # If ALL fields were already English, mark as already_english
                translation_statuses = [title_status, summary_status, content_status]

                if "translated" in translation_statuses:
                    overall_status = "translated"
                    stats["translated"] += 1
                elif all(s in ["already_english", "empty"] for s in translation_statuses):
                    overall_status = "already_english"
                    stats["already_english"] += 1
                else:
                    overall_status = "error"
                    stats["errors"] += 1

                # Update database
                execute_query(
                    """UPDATE leads
                       SET title_translated = ?,
                           summary_translated = ?,
                           content_translated = ?,
                           detected_language = ?,
                           translation_status = ?,
                           translated_at = ?
                       WHERE id = ?""",
                    (title_result, summary_result, content_result, detected_lang,
                     overall_status, datetime.utcnow().isoformat(), lead["id"])
                )

            except Exception as e:
                print(f"Error translating lead {lead['id']}: {e}")
                stats["errors"] += 1
                execute_query(
                    "UPDATE leads SET translation_status = ? WHERE id = ?",
                    ("error", lead["id"])
                )

        return stats

    def translate_instagram_posts(self, feed_id: Optional[int] = None, limit: Optional[int] = None) -> Dict:
        """Translate Instagram post captions."""
        query = """
            SELECT id, caption
            FROM instagram_posts
            WHERE (translation_status IS NULL OR translation_status = 'pending')
        """
        params = []

        if feed_id:
            query += " AND instagram_feed_id = ?"
            params.append(feed_id)

        if limit:
            query += " LIMIT ?"
            params.append(limit)

        posts = fetch_all(query, tuple(params))

        stats = {"total": len(posts), "translated": 0, "already_english": 0, "errors": 0, "skipped": 0}

        for post in posts:
            caption = post.get("caption")
            if not caption:
                execute_query(
                    "UPDATE instagram_posts SET translation_status = ? WHERE id = ?",
                    ("skipped", post["id"])
                )
                stats["skipped"] += 1
                continue

            try:
                detected_lang = self.translator.detect_language(caption)
                translated, status = self.translator.translate_text(caption)

                if status == "already_english":
                    stats["already_english"] += 1
                elif status == "translated":
                    stats["translated"] += 1
                else:
                    stats["errors"] += 1

                execute_query(
                    """UPDATE instagram_posts
                       SET caption_translated = ?,
                           detected_language = ?,
                           translation_status = ?,
                           translated_at = ?
                       WHERE id = ?""",
                    (translated, detected_lang, status, datetime.utcnow().isoformat(), post["id"])
                )
            except Exception as e:
                print(f"Error translating Instagram post {post['id']}: {e}")
                stats["errors"] += 1

        return stats

    def translate_reddit_posts(self, feed_id: Optional[int] = None, limit: Optional[int] = None) -> Dict:
        """Translate Reddit post titles and selftext."""
        query = """
            SELECT id, title, selftext
            FROM reddit_posts
            WHERE (translation_status IS NULL OR translation_status = 'pending')
        """
        params = []

        if feed_id:
            query += " AND reddit_feed_id = ?"
            params.append(feed_id)

        if limit:
            query += " LIMIT ?"
            params.append(limit)

        posts = fetch_all(query, tuple(params))

        stats = {"total": len(posts), "translated": 0, "already_english": 0, "errors": 0, "skipped": 0}

        for post in posts:
            try:
                title_result, title_status = self.translator.translate_text(post.get("title", ""))
                selftext_result, selftext_status = self.translator.translate_text(post.get("selftext") or "")

                # Detect language from original title for display purposes
                detected_lang = self.translator.detect_language(post.get("title", ""))

                # Determine overall status based on actual translation results
                translation_statuses = [title_status, selftext_status]

                if "translated" in translation_statuses:
                    overall_status = "translated"
                    stats["translated"] += 1
                elif all(s in ["already_english", "empty"] for s in translation_statuses):
                    overall_status = "already_english"
                    stats["already_english"] += 1
                else:
                    overall_status = "error"
                    stats["errors"] += 1

                execute_query(
                    """UPDATE reddit_posts
                       SET title_translated = ?,
                           selftext_translated = ?,
                           detected_language = ?,
                           translation_status = ?,
                           translated_at = ?
                       WHERE id = ?""",
                    (title_result, selftext_result, detected_lang,
                     overall_status, datetime.utcnow().isoformat(), post["id"])
                )
            except Exception as e:
                print(f"Error translating Reddit post {post['id']}: {e}")
                stats["errors"] += 1

        return stats

    def get_translation_stats(self) -> Dict:
        """Get overall translation statistics across all content types."""
        stats = {
            "leads": self._get_table_stats("leads"),
            "instagram_posts": self._get_table_stats("instagram_posts"),
            "reddit_posts": self._get_table_stats("reddit_posts")
        }
        return stats

    def _get_table_stats(self, table: str) -> Dict:
        """Get translation stats for a specific table."""
        result = fetch_one(f"""
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN translation_status = 'translated' THEN 1 ELSE 0 END) as translated,
                SUM(CASE WHEN translation_status = 'already_english' THEN 1 ELSE 0 END) as already_english,
                SUM(CASE WHEN translation_status = 'pending' OR translation_status IS NULL THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN translation_status = 'error' THEN 1 ELSE 0 END) as errors
            FROM {table}
        """)
        return result or {}

    def detect_missing_languages(self) -> Dict:
        """
        Detect language for all content across all sources that have NULL detected_language.
        This is useful for backfilling existing data.
        """
        stats = {
            "leads_updated": 0,
            "instagram_updated": 0,
            "reddit_updated": 0
        }

        # Detect language for RSS leads - use summary/content for better accuracy
        leads = fetch_all("SELECT id, title, summary, content FROM leads WHERE detected_language IS NULL", ())
        for lead in leads:
            # Use longest available text (summary > content > title)
            text_for_detection = lead.get("summary") or lead.get("content") or lead.get("title")
            if text_for_detection:
                detected_lang = self.translator.detect_language(text_for_detection)
                execute_query(
                    "UPDATE leads SET detected_language = ? WHERE id = ?",
                    (detected_lang, lead["id"])
                )
                stats["leads_updated"] += 1

        # Detect language for Instagram posts
        instagram_posts = fetch_all("SELECT id, caption FROM instagram_posts WHERE detected_language IS NULL", ())
        for post in instagram_posts:
            if post.get("caption"):
                detected_lang = self.translator.detect_language(post["caption"])
                execute_query(
                    "UPDATE instagram_posts SET detected_language = ? WHERE id = ?",
                    (detected_lang, post["id"])
                )
                stats["instagram_updated"] += 1

        # Detect language for Reddit posts
        reddit_posts = fetch_all("SELECT id, title FROM reddit_posts WHERE detected_language IS NULL", ())
        for post in reddit_posts:
            if post.get("title"):
                detected_lang = self.translator.detect_language(post["title"])
                execute_query(
                    "UPDATE reddit_posts SET detected_language = ? WHERE id = ?",
                    (detected_lang, post["id"])
                )
                stats["reddit_updated"] += 1

        return stats

    def redetect_all_languages(self) -> Dict:
        """
        Force re-detect language for ALL content across all sources.
        Useful for fixing incorrect detections from previous runs.
        """
        stats = {
            "leads_updated": 0,
            "instagram_updated": 0,
            "reddit_updated": 0
        }

        # Re-detect language for ALL RSS leads using summary/content
        leads = fetch_all("SELECT id, title, summary, content FROM leads", ())
        for lead in leads:
            text_for_detection = lead.get("summary") or lead.get("content") or lead.get("title")
            if text_for_detection:
                detected_lang = self.translator.detect_language(text_for_detection)
                execute_query(
                    "UPDATE leads SET detected_language = ? WHERE id = ?",
                    (detected_lang, lead["id"])
                )
                stats["leads_updated"] += 1

        # Re-detect language for ALL Instagram posts
        instagram_posts = fetch_all("SELECT id, caption FROM instagram_posts", ())
        for post in instagram_posts:
            if post.get("caption"):
                detected_lang = self.translator.detect_language(post["caption"])
                execute_query(
                    "UPDATE instagram_posts SET detected_language = ? WHERE id = ?",
                    (detected_lang, post["id"])
                )
                stats["instagram_updated"] += 1

        # Re-detect language for ALL Reddit posts
        reddit_posts = fetch_all("SELECT id, title FROM reddit_posts", ())
        for post in reddit_posts:
            if post.get("title"):
                detected_lang = self.translator.detect_language(post["title"])
                execute_query(
                    "UPDATE reddit_posts SET detected_language = ? WHERE id = ?",
                    (detected_lang, post["id"])
                )
                stats["reddit_updated"] += 1

        return stats
