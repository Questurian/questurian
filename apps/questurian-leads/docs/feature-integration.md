# Feature Integration Guidelines

This document defines the contract every new feature must follow so that
content flows from ingestion to the Approval queue and then to the Home page.
All sources (RSS, Instagram, scrapes, YouTube, X/Twitter, etc.) must follow
the same pipeline.

## Pipeline Contract (Pull -> Store -> Approval -> Home)

1) Pull data from the external source (API client, RSS parser, or scraper).
2) Store items in SQLite with `approval_status = 'pending'`.
3) Load pending items into the Approval queue at `http://localhost:5317/approval`.
4) On approval, update `approval_status = 'approved'`.
5) The Home page uses only approved items and merges them into the feed.

If a new feature does not appear on the Approval page, it will never show up
on the Home page.

## Required Content Fields

Each content table must include (or map to) these fields so it can render in
the Approval queue and Home feed:

- `title` or main text field
- `summary` or caption field
- `source_name` (feed name, username, channel, etc.)
- `link` (optional, but preferred)
- `image_url` (optional)
- `collected_at` (or a published timestamp)
- `approval_status`, `approved_by`, `approved_at`, `approval_notes`
- `detected_language`, `translation_status`, `translated_at` (if translated)

## Backend Integration Checklist

1) Create a feature module
   - Folder: `apps/api/features/<feature>/` with `api/`, `schema/`, `service/`.
   - Routes: `apps/api/features/<feature>/api/routes.py`.
   - Models: `apps/api/features/<feature>/schema/models.py`.
   - Services: fetcher/client/scraper logic in `service/`.

2) Add database tables
   - Update `apps/api/lib/database/init_db.py`.
   - Use `<feature>_feeds`, `<feature>_posts`, `<feature>_fetch_logs` when
     applicable.
   - Include approval + translation columns on content tables.

3) Add fetch endpoints
   - Add `GET /<feature>-feeds` or `GET /<feature>-posts` as needed.
   - Add `POST /<feature>-feeds/<id>/fetch` (multi) or `/fetch` (singleton).
   - Validate external input in `apps/api/utils/validation.py` before fetching.

4) Wire Approval queue
   - Add the content type in `apps/api/features/approval/schema/models.py`.
   - Add pending list queries in `apps/api/features/approval/api/routes.py`.
   - Add the table map for approve/reject and stats.

5) Translation support (if needed)
   - If translating on ingest, use `features/translation/service/translator.py`.
   - If translating later, add a handler to
     `apps/api/features/translation/service/content_translator.py`.

6) Register the router
   - Add `app.include_router(...)` in `apps/api/app/main.py`.

7) Scrape-specific steps (if scraping)
   - Use the singleton pattern (one feed row per site).
   - Create `service/spider.py` and `service/fetcher.py`.
   - Register in `apps/api/features/scrapes/api/routes.py`.
   - See `docs/scrapes.md` for the full checklist.

## Frontend Integration Checklist

1) API client + hooks
   - Add API helpers in `apps/client/src/api.js`.
   - Add hooks in `apps/client/src/hooks/` (list, fetch, posts).

2) Approval page
   - Add labels and filter tabs in `apps/client/src/pages/ApprovalQueue.jsx`.
   - Make sure the Approval queue shows the new content type.

3) Home page
   - Fetch approved content in `apps/client/src/pages/Dashboard.jsx`.
   - Add the content type to `combinedItems` and render cards.

4) Scrapes page (if scraping)
   - Add label mappings in `apps/client/src/pages/Scrapes.jsx`.
   - Add fetch controls in `apps/client/src/pages/ManageScrapes.jsx`.

5) Dev cleanup (optional)
   - Extend `apps/api/features/dev/api/routes.py` if the Settings delete buttons
     should wipe the new tables.

## Quick Smoke Test

1) Trigger a fetch from the API.
2) Confirm new items appear on `http://localhost:5317/approval`.
3) Approve one item.
4) Confirm it shows on the Home page (and Scrapes page if applicable).
