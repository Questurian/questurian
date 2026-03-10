import os
import sqlite3

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from features.feed.api.routes import router as feed_router
from features.categories.api.routes import router as categories_router
from features.countries.api.routes import router as countries_router
from features.feeds.api.routes import router as feeds_router
from features.tags.api.routes import router as tags_router
from features.leads.api.routes import router as leads_router
from features.fetch_logs.api.routes import router as fetch_logs_router
from features.dev.api.routes import router as dev_router
from features.instagram_feeds.api.routes import router as instagram_feeds_router
from features.subreddits.api.routes import router as subreddits_router
from features.translation.api.routes import router as translation_router
from features.approval.api.routes import router as approval_router
from features.el_comercio_feeds.api.routes import router as el_comercio_feeds_router
from features.diario_correo_feeds.api.routes import router as diario_correo_feeds_router
from features.scrapes.api.routes import router as scrapes_router
from features.youtube_feeds.api.routes import router as youtube_feeds_router
from features.batch_fetch.api.routes import router as batch_fetch_router
from lib.database.init_db import DATABASE_PATH, run_migrations

app = FastAPI(title="RSS Leads API")

def _should_run_migrations() -> bool:
    return os.getenv("RUN_MIGRATIONS", "").strip().lower() in {"1", "true", "yes", "on"}


def _database_needs_migrations() -> bool:
    if not DATABASE_PATH.exists() or DATABASE_PATH.stat().st_size == 0:
        return True

    try:
        conn = sqlite3.connect(DATABASE_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name = 'categories'"
        )
        has_categories = cursor.fetchone() is not None
        conn.close()
        return not has_categories
    except sqlite3.Error:
        return True

# Add CORS middleware
origins_env = os.getenv("CORS_ALLOW_ORIGINS")
if origins_env:
    allow_origins = [origin.strip() for origin in origins_env.split(",") if origin.strip()]
else:
    allow_origins = [
        "http://localhost:3004",
        "http://127.0.0.1:3004",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def run_startup_migrations() -> None:
    if _should_run_migrations() or _database_needs_migrations():
        run_migrations()

# Include all routers
app.include_router(categories_router)
app.include_router(countries_router)
app.include_router(feeds_router)
app.include_router(tags_router)
app.include_router(leads_router)
app.include_router(fetch_logs_router)
app.include_router(feed_router)
app.include_router(instagram_feeds_router)
app.include_router(subreddits_router)
app.include_router(translation_router)
app.include_router(approval_router)
app.include_router(el_comercio_feeds_router)
app.include_router(diario_correo_feeds_router)
app.include_router(scrapes_router)
app.include_router(youtube_feeds_router)
app.include_router(dev_router)
app.include_router(batch_fetch_router)


@app.get("/health", tags=["health"])
def health() -> dict:
    return {"status": "ok"}
