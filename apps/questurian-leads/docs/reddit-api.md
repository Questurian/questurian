# Subreddits API

This API stores subreddit links so the UI can display browseable sources.
It does not fetch Reddit posts.

Base URL: `http://localhost:8428`

## Endpoints

### List subreddits
`GET /subreddits`

Optional query params:
- `category_id`
- `limit`
- `offset`

Example:
```bash
curl "http://localhost:8428/subreddits"
```

### Create a subreddit
`POST /subreddits`

Body:
- `category_id` (required)
- `subreddit` (required) - accepts `r/python` or `https://reddit.com/r/python`
- `display_name` (required)
- `description` (optional)

Example:
```bash
curl -X POST "http://localhost:8428/subreddits" \
  -H "Content-Type: application/json" \
  -d '{
    "category_id": 2,
    "subreddit": "https://reddit.com/r/python",
    "display_name": "Python Community",
    "description": "Programming discussions about Python"
  }'
```

### Get a subreddit
`GET /subreddits/{id}`

Example:
```bash
curl "http://localhost:8428/subreddits/1"
```

### Update a subreddit
`PUT /subreddits/{id}`

Example:
```bash
curl -X PUT "http://localhost:8428/subreddits/1" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "Python (Official)",
    "description": "Updated description"
  }'
```

### Delete a subreddit
`DELETE /subreddits/{id}`

Example:
```bash
curl -X DELETE "http://localhost:8428/subreddits/1"
```

## Database

Subreddit entries are stored in `apps/api/leads.db` in the `reddit_feeds` table.
