# RSS Leads Manager

A full-stack application for managing RSS feeds, organizing them by categories and tags, and tracking leads from hundreds of feeds.

## Features

- **Categories**: Organize feeds into categories (Jobs, AI, Crypto, etc.)
- **Feeds**: Manage RSS feed sources with automatic deduplication
- **Tags**: Label feeds with multiple tags (Remote, Python, Senior, etc.)
- **Leads**: Track and search collected items from feeds
- **Fetch Logs**: Monitor feed fetch history and errors
- **Full CRUD API**: Complete REST API for all operations
- **Modern UI**: Clean, responsive React frontend

## Tech Stack

**Backend:**
- Python 3 with FastAPI
- SQLite database
- Pydantic for validation

**Frontend:**
- React 18
- React Router
- Vite

## Getting Started

### Prerequisites

- Python 3.8+
- Bun (or npm/yarn)

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo>
   cd test
   ```

2. **Install Python dependencies**
   ```bash
   pip install -r apps/api/requirements.txt
   ```

3. **Initialize the database**
   ```bash
   python3 apps/api/lib/database/init_db.py
   ```
   This creates `apps/api/leads.db` with sample data.

4. **Install frontend dependencies**
   ```bash
   bun install
   ```

### Running the Application

**Option 1: Run both servers separately**

Terminal 1 - Backend:
```bash
cd apps/api
bun run dev
```
Backend runs on http://localhost:8428

Terminal 2 - Frontend:
```bash
cd apps/client
bun run dev
```
Frontend runs on http://localhost:5317

**Option 2: Run with Turbo (recommended)**

From the root directory:
```bash
bun run dev
```

This starts both the backend and frontend concurrently.

**Option 3: Run everything in Docker (dev)**

From the root directory:
```bash
docker compose up --build
```

This starts:
- API: http://localhost:8428
- Frontend: http://localhost:5317
- LibreTranslate: http://localhost:5001

Notes:
- Set `YOUTUBE_API_KEY`, `RAPIDAPI_KEY`, and `LIBRETRANSLATE_API_KEY` in your environment if needed.
- The API container runs `python lib/database/init_db.py` on startup and uses `apps/api/leads.db`.

### Access the Application

Open your browser to http://localhost:5317

## Database Schema

### Tables

1. **categories** - Feed categories (1:many with feeds)
2. **feeds** - RSS feed sources
3. **feed_tags** - Available tags
4. **feed_tag_map** - Many-to-many feed-tag relationships
5. **leads** - Parsed items from feeds (deduplicated by GUID)
6. **fetch_logs** - History of feed fetch attempts

## API Endpoints

### Categories
- `GET /categories` - List all categories
- `POST /categories` - Create category
- `PUT /categories/{id}` - Update category
- `DELETE /categories/{id}` - Delete category

### Feeds
- `GET /feeds` - List all feeds (supports filters: active, category_id)
- `POST /feeds` - Create feed
- `PUT /feeds/{id}` - Update feed
- `PATCH /feeds/{id}/activate` - Activate feed
- `PATCH /feeds/{id}/deactivate` - Deactivate feed
- `DELETE /feeds/{id}` - Delete feed
- `GET /feeds/category/{category_id}` - Get feeds by category

### Tags
- `GET /tags` - List all tags
- `POST /tags` - Create tag
- `PUT /tags/{id}` - Update tag
- `DELETE /tags/{id}` - Delete tag
- `POST /tags/feeds/{feed_id}/tags/{tag_id}` - Add tag to feed
- `DELETE /tags/feeds/{feed_id}/tags/{tag_id}` - Remove tag from feed
- `PUT /tags/feeds/{feed_id}/tags` - Bulk replace feed tags

### Leads
- `GET /leads` - List all leads (supports search, category, tag, feed_id filters)
- `POST /leads` - Create lead
- `PUT /leads/{id}` - Update lead
- `DELETE /leads/{id}` - Delete lead
- `GET /leads/feed/{feed_id}` - Get leads by feed
- `GET /leads/tag/{tag_name}` - Get leads by tag
- `GET /leads/category/{category_name}` - Get leads by category

### Fetch Logs
- `GET /logs` - List fetch logs (supports feed_id, status filters)
- `GET /logs/feed/{feed_id}` - Get logs for a feed
- `DELETE /logs/{id}` - Delete log entry

## Sample Data

The database comes pre-populated with:
- 3 categories (Jobs, AI, Crypto)
- 3 sample feeds
- 5 tags (Remote, Python, Senior, DeFi, Startups)
- 3 sample leads
- 3 sample fetch logs

## Development

### Project Structure

```
├── apps/
│   ├── api/               # Python backend
│   │   ├── app/           # FastAPI app
│   │   ├── features/      # Backend features
│   │   │   ├── categories/
│   │   │   ├── feeds/
│   │   │   ├── leads/
│   │   │   ├── tags/
│   │   │   └── fetch_logs/
│   │   ├── lib/
│   │   │   └── database/  # Database utilities
│   │   ├── leads.db       # SQLite database
│   │   └── requirements.txt # Python dependencies
│   └── client/            # React frontend
│       └── src/
│           ├── api.js     # API client
│           ├── components/ # Shared components
│           └── pages/     # Page components
```

### Adding New Features

1. Create a new feature directory in `apps/api/features/`
2. Add schema models with Pydantic
3. Create API routes
4. Add routes to `apps/api/app/main.py`
5. Create corresponding UI page in `apps/client/src/pages/`
6. Add route to `App.jsx`

## API Documentation

Once the backend is running, visit:
- **Swagger UI**: http://localhost:8428/docs
- **ReDoc**: http://localhost:8428/redoc

## License

MIT
