# Feed Feature

## Overview
Provides a REST endpoint for parsing RSS/Atom feeds using `feedparser`.

## Endpoint
- `GET /feed?url=<feed_url>`

## Response
Returns normalized feed metadata and entries. When parsing encounters issues,
`bozo` is `true` and `bozo_exception` includes the parser error text.

## Notes
- URL validation happens in `apps/api/utils/validation.py`.
- Feed parsing and normalization live in `apps/api/features/feed/service/`.
- API routing lives in `apps/api/features/feed/api/`.
