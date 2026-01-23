# Diario Correo Feed Feature

## Overview
Scrapes Diario Correo's Gastronomia section and stores articles in SQLite.
Data is pulled from the Fusion content cache JSON embedded in the page.

## Endpoints
- `GET /diario-correo-feeds` list feed configurations.
- `GET /diario-correo-feeds/{feed_id}` fetch a single feed.
- `POST /diario-correo-feeds/fetch` run the scraper (blocking).
- `POST /diario-correo-feeds/fetch-all` run all active feeds (blocking).
- `GET /diario-correo-feeds/posts` list scraped posts with filters.
- `GET /diario-correo-feeds/posts/{post_id}` fetch a single post.

## Scraping Flow
1. Spider requests `https://diariocorreo.pe/gastronomia/`.
2. Parses `Fusion.contentCache` JSON to extract stories.
3. Fetcher deletes old posts, inserts the latest 15, and writes a fetch log.
4. Titles/excerpts are translated to English and queued for approval.

## Notes
- The fetch endpoints auto-create a single feed row (category `Peru`) if missing.
- Spider lives in `apps/api/features/diario_correo_feeds/service/spider.py`.
- Scrape results are stored in `diario_correo_posts`.
- Logs are stored in `diario_correo_fetch_logs`.
