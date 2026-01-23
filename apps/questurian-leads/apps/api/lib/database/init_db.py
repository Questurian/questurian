import sqlite3
from pathlib import Path

DATABASE_PATH = Path(__file__).parent.parent.parent / "leads.db"


def add_image_columns():
    """Add image_url column to content tables."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    # Helper function to check if column exists
    def column_exists(table_name, column_name):
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = [row[1] for row in cursor.fetchall()]
        return column_name in columns

    # Add image_url to leads table
    if not column_exists('leads', 'image_url'):
        cursor.execute("ALTER TABLE leads ADD COLUMN image_url TEXT")

    conn.commit()
    conn.close()
    print("✅ Image columns added to content tables")


def add_translation_columns():
    """Add translation columns to all content tables."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    # Helper function to check if column exists
    def column_exists(table_name, column_name):
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = [row[1] for row in cursor.fetchall()]
        return column_name in columns

    # Add translation columns to leads table
    if not column_exists('leads', 'title_translated'):
        cursor.execute("ALTER TABLE leads ADD COLUMN title_translated TEXT")
    if not column_exists('leads', 'summary_translated'):
        cursor.execute("ALTER TABLE leads ADD COLUMN summary_translated TEXT")
    if not column_exists('leads', 'content_translated'):
        cursor.execute("ALTER TABLE leads ADD COLUMN content_translated TEXT")
    if not column_exists('leads', 'detected_language'):
        cursor.execute("ALTER TABLE leads ADD COLUMN detected_language TEXT")
    if not column_exists('leads', 'translation_status'):
        cursor.execute("ALTER TABLE leads ADD COLUMN translation_status TEXT DEFAULT 'pending'")
    if not column_exists('leads', 'translated_at'):
        cursor.execute("ALTER TABLE leads ADD COLUMN translated_at TEXT")

    # Add translation columns to instagram_posts table
    if not column_exists('instagram_posts', 'caption_translated'):
        cursor.execute("ALTER TABLE instagram_posts ADD COLUMN caption_translated TEXT")
    if not column_exists('instagram_posts', 'detected_language'):
        cursor.execute("ALTER TABLE instagram_posts ADD COLUMN detected_language TEXT")
    if not column_exists('instagram_posts', 'translation_status'):
        cursor.execute("ALTER TABLE instagram_posts ADD COLUMN translation_status TEXT DEFAULT 'pending'")
    if not column_exists('instagram_posts', 'translated_at'):
        cursor.execute("ALTER TABLE instagram_posts ADD COLUMN translated_at TEXT")

    # Add translation columns to reddit_posts table
    if not column_exists('reddit_posts', 'title_translated'):
        cursor.execute("ALTER TABLE reddit_posts ADD COLUMN title_translated TEXT")
    if not column_exists('reddit_posts', 'selftext_translated'):
        cursor.execute("ALTER TABLE reddit_posts ADD COLUMN selftext_translated TEXT")
    if not column_exists('reddit_posts', 'detected_language'):
        cursor.execute("ALTER TABLE reddit_posts ADD COLUMN detected_language TEXT")
    if not column_exists('reddit_posts', 'translation_status'):
        cursor.execute("ALTER TABLE reddit_posts ADD COLUMN translation_status TEXT DEFAULT 'pending'")
    if not column_exists('reddit_posts', 'translated_at'):
        cursor.execute("ALTER TABLE reddit_posts ADD COLUMN translated_at TEXT")

    conn.commit()
    conn.close()
    print("✅ Translation columns added to all content tables")


def add_approval_columns():
    """Add approval workflow columns to all content tables."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    # Helper function to check if column exists
    def column_exists(table_name, column_name):
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = [row[1] for row in cursor.fetchall()]
        return column_name in columns

    tables = ['leads', 'instagram_posts', 'reddit_posts']

    for table in tables:
        # Add approval_status column with DEFAULT 'approved' for existing records
        if not column_exists(table, 'approval_status'):
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN approval_status TEXT DEFAULT 'approved'")

        # Add approved_by column
        if not column_exists(table, 'approved_by'):
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN approved_by TEXT")

        # Add approved_at column
        if not column_exists(table, 'approved_at'):
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN approved_at TEXT")

        # Add approval_notes column
        if not column_exists(table, 'approval_notes'):
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN approval_notes TEXT")

    # Auto-approve all existing content (set explicit value for NULL entries)
    for table in tables:
        cursor.execute(f"UPDATE {table} SET approval_status = 'approved' WHERE approval_status IS NULL")

    conn.commit()
    conn.close()
    print("✅ Approval columns added to all content tables")

def add_country_columns():
    """Add country column to feed and content tables when available."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    def table_exists(table_name: str) -> bool:
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
            (table_name,)
        )
        return cursor.fetchone() is not None

    def column_exists(table_name: str, column_name: str) -> bool:
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = [row[1] for row in cursor.fetchall()]
        return column_name in columns

    tables = [
        "feeds",
        "instagram_feeds",
        "youtube_feeds",
        "leads",
        "instagram_posts",
        "el_comercio_posts",
        "diario_correo_posts",
    ]

    for table in tables:
        if not table_exists(table):
            continue
        if not column_exists(table, "country"):
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN country TEXT")

    conn.commit()
    conn.close()
    print("✅ Country columns added to feed and content tables")


def add_reddit_auto_approval():
    """Auto-approve Reddit posts on insert and clean up pending rows."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE reddit_posts
        SET approval_status = 'approved'
        WHERE approval_status IS NULL OR approval_status = 'pending'
    """)

    cursor.execute("""
        CREATE TRIGGER IF NOT EXISTS reddit_posts_auto_approve
        AFTER INSERT ON reddit_posts
        FOR EACH ROW
        WHEN NEW.approval_status IS NULL OR NEW.approval_status = 'pending'
        BEGIN
            UPDATE reddit_posts
            SET approval_status = 'approved'
            WHERE id = NEW.id;
        END;
    """)

    conn.commit()
    conn.close()
    print("✅ Reddit posts set to auto-approve")


def init_database():
    """Initialize the database with schema."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    # Create categories table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        )
    """)

    # Create countries table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS countries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        )
    """)

    # Create feeds table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS feeds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL,
            url TEXT UNIQUE NOT NULL,
            source_name TEXT NOT NULL,
            website TEXT,
            country TEXT,
            fetch_interval INTEGER DEFAULT 30,
            last_fetched TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )
    """)

    # Create feed_tags table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS feed_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        )
    """)

    # Create feed_tag_map table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS feed_tag_map (
            feed_id INTEGER,
            tag_id INTEGER,
            PRIMARY KEY (feed_id, tag_id),
            FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES feed_tags(id) ON DELETE CASCADE
        )
    """)

    # Create leads table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            feed_id INTEGER NOT NULL,
            guid TEXT UNIQUE,
            title TEXT NOT NULL,
            link TEXT NOT NULL,
            country TEXT,
            author TEXT,
            summary TEXT,
            content TEXT,
            published TEXT,
            collected_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (feed_id) REFERENCES feeds(id)
        )
    """)

    # Create fetch_logs table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fetch_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            feed_id INTEGER NOT NULL,
            fetched_at TEXT DEFAULT CURRENT_TIMESTAMP,
            status TEXT,
            lead_count INTEGER,
            error_message TEXT,
            FOREIGN KEY (feed_id) REFERENCES feeds(id)
        )
    """)

    # Create instagram_feeds table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS instagram_feeds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL,
            username TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            profile_url TEXT,
            country TEXT,
            fetch_interval INTEGER DEFAULT 60,
            last_fetched TEXT,
            last_max_id TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )
    """)

    # Create instagram_posts table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS instagram_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            instagram_feed_id INTEGER NOT NULL,
            post_id TEXT UNIQUE NOT NULL,
            username TEXT NOT NULL,
            country TEXT,
            caption TEXT,
            media_type TEXT,
            media_url TEXT,
            thumbnail_url TEXT,
            like_count INTEGER DEFAULT 0,
            comment_count INTEGER DEFAULT 0,
            view_count INTEGER,
            posted_at TEXT,
            permalink TEXT,
            collected_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (instagram_feed_id) REFERENCES instagram_feeds(id) ON DELETE CASCADE
        )
    """)

    # Create instagram_feed_tag_map table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS instagram_feed_tag_map (
            instagram_feed_id INTEGER,
            tag_id INTEGER,
            PRIMARY KEY (instagram_feed_id, tag_id),
            FOREIGN KEY (instagram_feed_id) REFERENCES instagram_feeds(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES feed_tags(id) ON DELETE CASCADE
        )
    """)

    # Create instagram_fetch_logs table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS instagram_fetch_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            instagram_feed_id INTEGER NOT NULL,
            fetched_at TEXT DEFAULT CURRENT_TIMESTAMP,
            status TEXT,
            post_count INTEGER,
            max_id TEXT,
            error_message TEXT,
            FOREIGN KEY (instagram_feed_id) REFERENCES instagram_feeds(id) ON DELETE CASCADE
        )
    """)

    # Create reddit_feeds table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reddit_feeds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL,
            subreddit TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            description TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )
    """)

    # Create reddit_posts table (if not exists)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reddit_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reddit_feed_id INTEGER NOT NULL,
            post_id TEXT UNIQUE NOT NULL,
            subreddit TEXT NOT NULL,
            title TEXT NOT NULL,
            author TEXT,
            score INTEGER DEFAULT 0,
            num_comments INTEGER DEFAULT 0,
            permalink TEXT,
            url TEXT,
            selftext TEXT,
            created_utc INTEGER,
            post_type TEXT,
            collected_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (reddit_feed_id) REFERENCES reddit_feeds(id) ON DELETE CASCADE
        )
    """)

    # Create reddit_feed_tag_map table (if not exists)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reddit_feed_tag_map (
            reddit_feed_id INTEGER,
            tag_id INTEGER,
            PRIMARY KEY (reddit_feed_id, tag_id),
            FOREIGN KEY (reddit_feed_id) REFERENCES reddit_feeds(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES feed_tags(id) ON DELETE CASCADE
        )
    """)

    # Create reddit_fetch_logs table (if not exists)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reddit_fetch_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reddit_feed_id INTEGER NOT NULL,
            fetched_at TEXT DEFAULT CURRENT_TIMESTAMP,
            status TEXT,
            post_count INTEGER,
            error_message TEXT,
            FOREIGN KEY (reddit_feed_id) REFERENCES reddit_feeds(id) ON DELETE CASCADE
        )
    """)

    conn.commit()
    conn.close()
    print(f"✅ Database initialized at {DATABASE_PATH}")

    # Run migration for new columns
    add_image_columns()
    add_translation_columns()
    add_approval_columns()
    add_reddit_auto_approval()
    add_country_columns()


def add_el_comercio_tables():
    """Add El Comercio scraping tables."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    # Table 1: Feed configuration
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS el_comercio_feeds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL,
            url TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            section TEXT NOT NULL,
            fetch_interval INTEGER DEFAULT 60,
            last_fetched TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )
    """)

    # Table 2: Scraped articles
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS el_comercio_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            el_comercio_feed_id INTEGER NOT NULL,
            url TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            published_at TEXT,
            section TEXT DEFAULT 'gastronomia',
            country TEXT,
            image_url TEXT,
            excerpt TEXT,
            language TEXT DEFAULT 'es',
            source TEXT DEFAULT 'elcomercio',
            collected_at TEXT DEFAULT CURRENT_TIMESTAMP,
            title_translated TEXT,
            excerpt_translated TEXT,
            detected_language TEXT,
            translation_status TEXT DEFAULT 'pending',
            translated_at TEXT,
            approval_status TEXT DEFAULT 'pending',
            approved_by TEXT,
            approved_at TEXT,
            approval_notes TEXT,
            FOREIGN KEY (el_comercio_feed_id) REFERENCES el_comercio_feeds(id) ON DELETE CASCADE
        )
    """)

    # Table 3: Tag mapping
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS el_comercio_feed_tag_map (
            el_comercio_feed_id INTEGER,
            tag_id INTEGER,
            PRIMARY KEY (el_comercio_feed_id, tag_id),
            FOREIGN KEY (el_comercio_feed_id) REFERENCES el_comercio_feeds(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES feed_tags(id) ON DELETE CASCADE
        )
    """)

    # Table 4: Fetch logs
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS el_comercio_fetch_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            el_comercio_feed_id INTEGER NOT NULL,
            fetched_at TEXT DEFAULT CURRENT_TIMESTAMP,
            status TEXT,
            post_count INTEGER,
            error_message TEXT,
            FOREIGN KEY (el_comercio_feed_id) REFERENCES el_comercio_feeds(id) ON DELETE CASCADE
        )
    """)

    conn.commit()
    conn.close()
    print("✅ El Comercio tables created")


def add_diario_correo_tables():
    """Add Diario Correo scraping tables."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    # Table 1: Feed configuration
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS diario_correo_feeds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL,
            url TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            section TEXT NOT NULL,
            fetch_interval INTEGER DEFAULT 60,
            last_fetched TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )
    """)

    # Table 2: Scraped articles
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS diario_correo_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            diario_correo_feed_id INTEGER NOT NULL,
            url TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            published_at TEXT,
            section TEXT DEFAULT 'gastronomia',
            country TEXT,
            image_url TEXT,
            excerpt TEXT,
            language TEXT DEFAULT 'es',
            source TEXT DEFAULT 'diariocorreo',
            collected_at TEXT DEFAULT CURRENT_TIMESTAMP,
            title_translated TEXT,
            excerpt_translated TEXT,
            detected_language TEXT,
            translation_status TEXT DEFAULT 'pending',
            translated_at TEXT,
            approval_status TEXT DEFAULT 'pending',
            approved_by TEXT,
            approved_at TEXT,
            approval_notes TEXT,
            FOREIGN KEY (diario_correo_feed_id) REFERENCES diario_correo_feeds(id) ON DELETE CASCADE
        )
    """)

    # Table 3: Tag mapping
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS diario_correo_feed_tag_map (
            diario_correo_feed_id INTEGER,
            tag_id INTEGER,
            PRIMARY KEY (diario_correo_feed_id, tag_id),
            FOREIGN KEY (diario_correo_feed_id) REFERENCES diario_correo_feeds(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES feed_tags(id) ON DELETE CASCADE
        )
    """)

    # Table 4: Fetch logs
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS diario_correo_fetch_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            diario_correo_feed_id INTEGER NOT NULL,
            fetched_at TEXT DEFAULT CURRENT_TIMESTAMP,
            status TEXT,
            post_count INTEGER,
            error_message TEXT,
            FOREIGN KEY (diario_correo_feed_id) REFERENCES diario_correo_feeds(id) ON DELETE CASCADE
        )
    """)

    conn.commit()
    conn.close()
    print("✅ Diario Correo tables created")


def add_youtube_tables():
    """Add YouTube feed tables."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS youtube_feeds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL,
            channel_id TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            channel_url TEXT,
            fetch_interval INTEGER DEFAULT 60,
            last_fetched TEXT,
            is_active INTEGER DEFAULT 1,
            country TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS youtube_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            youtube_feed_id INTEGER NOT NULL,
            video_id TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            published_at TEXT,
            thumbnail_url TEXT,
            video_url TEXT,
            collected_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (youtube_feed_id) REFERENCES youtube_feeds(id) ON DELETE CASCADE
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS youtube_fetch_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            youtube_feed_id INTEGER NOT NULL,
            fetched_at TEXT DEFAULT CURRENT_TIMESTAMP,
            status TEXT,
            post_count INTEGER,
            max_results INTEGER,
            error_message TEXT,
            FOREIGN KEY (youtube_feed_id) REFERENCES youtube_feeds(id) ON DELETE CASCADE
        )
    """)

    conn.commit()
    conn.close()
    print("✅ YouTube tables created")


def add_batch_fetch_tables():
    """Add batch fetch job tables."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS batch_fetch_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            status TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            started_at TEXT,
            finished_at TEXT,
            total_steps INTEGER DEFAULT 0,
            completed_steps INTEGER DEFAULT 0,
            success_steps INTEGER DEFAULT 0,
            failed_steps INTEGER DEFAULT 0,
            skipped_steps INTEGER DEFAULT 0,
            message TEXT,
            error_message TEXT,
            config_json TEXT
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS batch_fetch_job_steps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            source_type TEXT NOT NULL,
            source_id INTEGER,
            source_name TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            started_at TEXT,
            finished_at TEXT,
            result_json TEXT,
            error_message TEXT,
            skip_reason TEXT,
            FOREIGN KEY (job_id) REFERENCES batch_fetch_jobs(id) ON DELETE CASCADE
        )
    """)

    conn.commit()
    conn.close()
    print("✅ Batch fetch tables created")


def add_youtube_transcript_columns():
    """Add transcript columns to youtube_posts table."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    def column_exists(table_name, column_name):
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = [row[1] for row in cursor.fetchall()]
        return column_name in columns

    if not column_exists('youtube_posts', 'transcript'):
        cursor.execute("ALTER TABLE youtube_posts ADD COLUMN transcript TEXT")
    if not column_exists('youtube_posts', 'transcript_status'):
        cursor.execute("ALTER TABLE youtube_posts ADD COLUMN transcript_status TEXT")
    if not column_exists('youtube_posts', 'transcript_error'):
        cursor.execute("ALTER TABLE youtube_posts ADD COLUMN transcript_error TEXT")
    if not column_exists('youtube_posts', 'transcript_extracted_at'):
        cursor.execute("ALTER TABLE youtube_posts ADD COLUMN transcript_extracted_at TEXT")

    conn.commit()
    conn.close()
    print("✅ YouTube transcript columns added")


def run_migrations():
    """Run all schema setup and migrations."""
    init_database()
    add_el_comercio_tables()
    add_diario_correo_tables()
    add_youtube_tables()
    add_youtube_transcript_columns()
    add_batch_fetch_tables()


if __name__ == "__main__":
    run_migrations()
