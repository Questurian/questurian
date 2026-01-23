# API Routes

This document describes the FastAPI routes defined in
`apps/api/app/main.py` and
`apps/api/features/feed/api/routes.py`. The dev server runs at
`http://127.0.0.1:8428` by default.

## GET /health

Purpose: Simple health check.

Request
- Method: GET
- Path: /health
- Query params: none
- Body: none
- Auth: none

Response
- 200 OK
  - Body:
    ```json
    {
      "status": "ok"
    }
    ```

## GET /feed

Purpose: Parse an RSS/Atom feed URL and return normalized metadata and
entries.

Request
- Method: GET
- Path: /feed
- Query params:
  - `url` (string, required): Feed URL to parse. Must be a non-empty
    string, start with `http` or `https`, and include a hostname.
- Body: none
- Auth: none
- Example:
  - `GET /feed?url=https://example.com/rss.xml`

Responses
- 200 OK
  - Body: `FeedResponse`
    - `feed` (object)
      - `title`, `link`, `subtitle`, `language`, `updated`, `published`,
        `author` (string or null)
    - `entries` (array of objects)
      - `id`, `title`, `link`, `summary`, `content`, `published`,
        `updated`, `author` (string or null)
    - `bozo` (boolean): true if the feed parser reported a parsing issue.
    - `bozo_exception` (string or null): stringified parser exception
      when `bozo` is true.
  - Example:
    ```json
    {
      "feed": {
        "title": "Example Feed",
        "link": "https://example.com",
        "subtitle": "News",
        "language": "en",
        "updated": "2024-01-01T00:00:00Z",
        "published": null,
        "author": "Example Author"
      },
      "entries": [
        {
          "id": "https://example.com/post/1",
          "title": "Post 1",
          "link": "https://example.com/post/1",
          "summary": "Short summary",
          "content": "<p>Full content</p>",
          "published": "2024-01-01T00:00:00Z",
          "updated": null,
          "author": "Jane Doe"
        }
      ],
      "bozo": false,
      "bozo_exception": null
    }
    ```

- 400 Bad Request
  - Body:
    ```json
    {
      "detail": "<message>"
    }
    ```
  - Possible messages:
    - `URL must be a string.`
    - `URL is required.`
    - `URL must start with http or https.`
    - `URL must include a hostname.`

## Batch Fetch Jobs

Batch fetch runs all active sources (RSS, Instagram, YouTube, El Comercio, Diario Correo)
in one background job. Sources fetched within the last 24 hours are skipped, and Instagram
calls are spaced out by 5-10 seconds by default.

### POST /batch-fetch

Purpose: Start a batch fetch job.

Query params
- `force` (boolean, default false): Ignore the 24-hour skip window (still skips inactive feeds).

Response
- 200 OK
  - Body: `BatchFetchJobDetailResponse` (includes steps)
- 409 Conflict
  - When a job is already running.

### GET /batch-fetch/current

Purpose: Get the current running job, or the most recent job if none are running.

Response
- 200 OK
  - Body: `BatchFetchJobDetailResponse` or `null` if no jobs exist.

### GET /batch-fetch

Purpose: List recent batch jobs.

Query params
- `limit` (int, default 20, max 200)
- `offset` (int, default 0)

Response
- 200 OK
  - Body: array of `BatchFetchJobResponse`

### GET /batch-fetch/{job_id}

Purpose: Get a job with its step details.

Response
- 200 OK
  - Body: `BatchFetchJobDetailResponse`
- 404 Not Found
  - If the job does not exist.
