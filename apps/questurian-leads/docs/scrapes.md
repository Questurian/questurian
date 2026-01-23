# Scrape Registry & New Source Template

This document tracks current scrape sources and provides a checklist/template
for adding the next site. The pipeline is single-source (singleton) per site:
one feed row per source, one fetch endpoint, and hard-coded parsing logic.

## Registry

### El Comercio
- Feature folder: `apps/api/features/el_comercio_feeds/`
- Source URL: `https://elcomercio.pe/archivo/gastronomia/`
- Tables: `el_comercio_feeds`, `el_comercio_posts`, `el_comercio_fetch_logs`
- Fetch endpoint: `POST /el-comercio-feeds/fetch`
- Unified scrapes content type: `el_comercio_post`

### Diario Correo
- Feature folder: `apps/api/features/diario_correo_feeds/`
- Source URL: `https://diariocorreo.pe/gastronomia/`
- Tables: `diario_correo_feeds`, `diario_correo_posts`, `diario_correo_fetch_logs`
- Fetch endpoint: `POST /diario-correo-feeds/fetch`
- Unified scrapes content type: `diario_correo_post`

## Pipeline Overview (Singleton)

1. `POST /<site>-feeds/fetch` triggers the fetcher.
2. Fetcher runs a spider (Scrapy or HTML fallback).
3. Existing posts for the feed are deleted.
4. New posts are inserted with translations and `approval_status='pending'`.
5. Fetch log row is written; approvals happen in `/approval`.

## Template: Add a New Site

Use this checklist to add a new source (one URL per site).

### 1) Create feature folder
```
apps/api/features/<site>_feeds/
  api/
    __init__.py
    routes.py
  schema/
    __init__.py
    models.py
  service/
    __init__.py
    spider.py
    fetcher.py
  __init__.py
  README.md
```

### 2) Add database tables
Update `apps/api/lib/database/init_db.py` with:
- `<site>_feeds`
- `<site>_posts`
- `<site>_fetch_logs`

Follow the El Comercio/Diario Correo schema fields, including:
`approval_status`, `translation_status`, `title_translated`, `excerpt_translated`.

### 3) Add the router
Register the router in `apps/api/app/main.py`:
```
from features.<site>_feeds.api.routes import router as <site>_feeds_router
app.include_router(<site>_feeds_router)
```

### 4) Implement fetcher and spider
In `service/fetcher.py`:
- `ensure_feed()` auto-creates a single feed row (category "Peru")
- `fetch_<site>_feed()` runs the spider, deletes existing posts, inserts new ones,
  translates title/excerpt, and writes a fetch log.

In `service/spider.py`:
- Scrapy spider that returns items with fields:
  `url`, `title`, `published_at`, `section`, `image_url`, `excerpt`, `language`, `source`.

### 5) Wire approval flow
Update:
- `apps/api/features/approval/api/routes.py` (query + table mapping)
- `apps/api/features/approval/schema/models.py` (add `<site>_post`)

### 6) Add to unified scrapes
Update `apps/api/features/scrapes/api/routes.py`:
- Add to `CONTENT_TYPES`
- Add a `<site>` select/count query builder
- Include it in the union when requested

### 7) Frontend wiring
Update client files to show and manage the new source:
- `apps/client/src/api.js` (feeds/posts endpoints)
- `apps/client/src/hooks/` (feeds/posts hooks)
- `apps/client/src/pages/ManageScrapes.jsx` (add source card + fetch action)
- `apps/client/src/pages/Scrapes.jsx` (no change unless content type label)
- `apps/client/src/pages/Dashboard.jsx` (if you want it on home feed)

### 8) Optional dev cleanup hooks
If you use Settings delete buttons for debugging, extend:
`apps/api/features/dev/api/routes.py` to clear `<site>` tables.

## README Template (per feature folder)

Copy this into `apps/api/features/<site>_feeds/README.md`:
```
# <Site> Feed Feature

## Overview
Scrapes <site> <section> and stores articles in SQLite.

## Endpoints
- `GET /<site>-feeds` list feed configurations.
- `POST /<site>-feeds/fetch` run the scraper (blocking).
- `GET /<site>-feeds/posts` list scraped posts with filters.

## Scraping Flow
1. Spider requests <site_url>.
2. Parses HTML/JSON to extract story data.
3. Fetcher replaces posts and writes a fetch log.
4. Items are translated and queued for approval.

## Notes
- The fetch endpoint auto-creates a single feed row (category `Peru`).
- Spider lives in `apps/api/features/<site>_feeds/service/spider.py`.
- Posts are stored in `<site>_posts`; logs in `<site>_fetch_logs`.
```
