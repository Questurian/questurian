#!/usr/bin/env python3
"""
Migration script to populate title_guideline data for all article types.
"""
import os
import sys
from pathlib import Path

# Add the backend app to the path
ROOT = Path(__file__).resolve().parent
backend_path = ROOT / "apps" / "backend"
sys.path.append(str(backend_path))

from app.storage.file_store import read_article_types
import sqlite3

def normalize_name(name: str) -> str:
    """Normalize a name for matching."""
    # Remove file extension and clean up special characters
    name = name.replace('.md', '')
    # Handle special cases
    name = name.replace('‑', '-')  # Replace special dash with regular dash
    name = name.replace('Best Of', 'Best Of')  # Fix special space
    name = name.replace('Buyer\'s', 'Buyer\'s')  # Fix apostrophe
    name = name.replace('Beginner\'s', 'Beginner\'s')  # Fix apostrophe
    name = name.replace('Buyer’s', 'Buyer\'s')  # Fix special apostrophe
    name = name.replace('Beginner’s', 'Beginner\'s')  # Fix special apostrophe
    # Handle the disqualifiers case
    if 'Disqualifiers' in name:
        name = 'Disqualifiers'
    return name.strip()

def main():
    """Migrate title guideline data."""
    # Determine which database to use
    db_path = None
    if os.path.exists('data/pipeline.db'):
        db_path = 'data/pipeline.db'
        print(f"Using database: {db_path}")
    elif os.path.exists('apps/backend/data/pipeline.db'):
        db_path = 'apps/backend/data/pipeline.db'
        print(f"Using database: {db_path}")
    else:
        print("❌ No database found")
        return

    title_dir = backend_path / "data" / "title"
    if not title_dir.exists():
        print(f"❌ Title directory not found: {title_dir}")
        return

    # Read all title guideline files
    title_guidelines = {}
    for md_file in title_dir.glob('*.md'):
        filename = md_file.name
        normalized_name = normalize_name(filename)

        try:
            with open(md_file, 'r', encoding='utf-8') as f:
                content = f.read().strip()
            title_guidelines[normalized_name] = content
            print(f"✓ Read: {normalized_name} ({len(content)} chars)")
        except Exception as e:
            print(f"❌ Failed to read {filename}: {e}")

    print(f"\nRead {len(title_guidelines)} title guideline files")

    # Get article types
    types = read_article_types()
    print(f"Found {len(types)} article types in database")

    # Update database directly
    conn = sqlite3.connect(db_path)
    updated_count = 0

    try:
        for article_type in types:
            name = article_type['name']
            normalized_name = normalize_name(name)

            if normalized_name in title_guidelines:
                content = title_guidelines[normalized_name]
                cursor = conn.execute("""
                    UPDATE article_types
                    SET title_guideline = ?, updated_at = datetime('now')
                    WHERE name = ?
                """, (content, name))

                if cursor.rowcount > 0:
                    print(f"✓ Updated: {name}")
                    updated_count += 1
                else:
                    print(f"❌ No rows updated for {name}")
            else:
                print(f"⚠️  No matching file for {name}")

        conn.commit()
        print(f"\n✅ Successfully updated {updated_count} article types")

        # Verify the update
        cursor = conn.execute("SELECT COUNT(*) FROM article_types WHERE length(title_guideline) > 0")
        count_with_data = cursor.fetchone()[0]
        print(f"✅ {count_with_data} article types now have title_guideline data")

    except Exception as e:
        print(f"❌ Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    main()