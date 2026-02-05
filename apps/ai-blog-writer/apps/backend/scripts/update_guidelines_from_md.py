#!/usr/bin/env python3
"""
Script to update article types with markdown guideline content from MD files.

Reads all .md files from apps/backend/data/guidelines/ and updates the
corresponding article_types records in the database with the guideline content.
"""
import sys
from pathlib import Path

# Add the shared packages to the path
ROOT = Path(__file__).resolve().parents[2]
for rel_path in ("packages/shared/src", "packages/utils/src"):
    path = str(ROOT / rel_path)
    if path not in sys.path:
        sys.path.append(path)

from app.storage.file_store import write_article_type, read_article_types

# Mapping from filename to article type name
# Some filenames differ slightly from the database names
FILENAME_TO_ARTICLE_TYPE = {
    "Adventure Guide.md": "Adventure Guide",
    "Beginner’s Guide.md": "Beginner's Guide",  # Note: curly apostrophe in filename
    "Best Of.md": "Best Of",
    "Budget Travel Guide.md": "Budget Travel Guide",
    "Buyer’s Guide.md": "Buyer's Guide",  # Note: curly apostrophe in filename
    "Case Study.md": "Case Study",
    "Checklist.md": "Checklist",
    "Comparison Article (A vs. B).md": "Comparison Article",
    "Cost Breakdown.md": "Cost Breakdown",
    "Cultural Etiquette Guide.md": "Cultural Etiquette Guide",
    "Destination Guide.md": "Destination Guide",
    "Digital Nomad Guide.md": "Digital Nomad Guide",
    "Disqualifiers.md": "Disqualifiers",
    "Explainer.md": "Explainer",
    "Family Travel Guide.md": "Family Travel Guide",
    "FAQ Article.md": "FAQ Article",
    "Feature Story.md": "Feature Story",
    "Food Travel Guide.md": "Food Travel Guide",
    "Hidden Gems Article.md": "Hidden Gems Article",
    "How-to Guides.md": "How-to Guides",
    "In-depth Analysis.md": "In-depth Analysis",
    "Interview Articles.md": "Interview",
    "Itinerary Article.md": "Itinerary Article",
    "Listicle.md": "Listicle",
    "Luxury Travel Guide.md": "Luxury Travel Guide",
    "Myth‑Busting Article.md": "Myth-Busting Article",
    "News Article.md": "News Article",
    "Opinion Pieces.md": "Opinion Piece",
    "Packing Guide.md": "Packing Guide",
    "Resource List.md": "Resource List",
    "Review.md": "Review",
    "Roundup.md": "Roundup",
    "Safety Guide.md": "Safety Guide",
    "Solo Travel Guide.md": "Solo Travel Guide",
    "Survival Guide.md": "Survival Guide",
    "Transportation Guide.md": "Transportation Guide",
    "Travel Diary.md": "Travel Diary",
    "Travel Inspiration Piece.md": "Travel Inspiration Piece",
    "Visa & Entry Guide.md": "Visa & Entry Guide",
    "When to Visit Article.md": "When to Visit Article",
    "Where to Stay Guide.md": "Where to Stay Guide",
}

def main():
    """Update article types with guideline content from MD files."""
    guidelines_dir = Path(__file__).parent / "data" / "guidelines"

    if not guidelines_dir.exists():
        print(f"❌ Guidelines directory not found: {guidelines_dir}")
        return

    # Get all existing article types to preserve their definitions
    existing_article_types = read_article_types()
    article_type_map = {at["name"]: at for at in existing_article_types}

    print(f"Found {len(existing_article_types)} existing article types")
    print(f"Found {len(list(guidelines_dir.glob('*.md')))} guideline files")

    updated_count = 0

    for md_file in guidelines_dir.glob("*.md"):
        filename = md_file.name
        article_type_name = FILENAME_TO_ARTICLE_TYPE.get(filename)

        if not article_type_name:
            print(f"⚠️  No mapping found for file: {filename}")
            continue

        if article_type_name not in article_type_map:
            print(f"⚠️  Article type '{article_type_name}' not found in database")
            continue

        try:
            # Read the guideline content
            guideline_content = md_file.read_text(encoding='utf-8')

            # Get the existing definition
            definition = article_type_map[article_type_name]["definition"]

            # Update the article type with the guideline content
            article_type_id = write_article_type(
                article_type_name,
                definition,
                guideline_content
            )

            print(f"✓ Updated: {article_type_name} (ID: {article_type_id})")
            updated_count += 1

        except Exception as e:
            print(f"✗ Failed to update {article_type_name}: {e}")

    print(f"\n✅ Updated {updated_count} article types with guideline content")

    # Verify all article types have guidelines
    updated_article_types = read_article_types()
    with_guidelines = sum(1 for at in updated_article_types if at["guideline"])
    total = len(updated_article_types)

    print(f"📊 Article types with guidelines: {with_guidelines}/{total}")


if __name__ == "__main__":
    main()