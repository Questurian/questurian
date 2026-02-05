#!/usr/bin/env python3
"""
Script to update article types with markdown guideline file paths.
"""
import sys
from pathlib import Path

# Add the shared packages to the path
ROOT = Path(__file__).resolve().parents[2]
for rel_path in ("packages/shared/src", "packages/utils/src"):
    path = str(ROOT / rel_path)
    if path not in sys.path:
        sys.path.append(path)

from app.storage.file_store import write_article_type

# Map article type names to their guideline file paths
GUIDELINE_FILES = {
    "How-to Guides": "data/guidelines/how-to-guides.md",
    "Opinion Piece": "data/guidelines/opinion-piece.md",
    "In-depth Analysis": "data/guidelines/in-depth-analysis.md",
    # Add more mappings as you create the files
}

# Article definitions (same as populate script)
ARTICLE_DEFINITIONS = {
    "How-to Guides": "Teaches a process, steps, or methods to achieve an outcome.",
    "Disqualifiers": "Warns who should NOT do something or filters an audience.",
    "Opinion Piece": "Expresses personal beliefs, judgments, or persuasion.",
    "In-depth Analysis": "Explains causes, systems, trade-offs, or frameworks deeply.",
    # ... add all others
}

def main():
    """Update article types with guideline file paths."""
    print("Updating article types with guideline paths...")

    for name, guideline_path in GUIDELINE_FILES.items():
        definition = ARTICLE_DEFINITIONS.get(name)
        if not definition:
            print(f"⚠️  No definition found for {name}")
            continue

        try:
            # Read the guideline file
            guideline_file = ROOT / guideline_path
            if guideline_file.exists():
                guideline_content = guideline_file.read_text()
                article_type_id = write_article_type(name, definition, guideline_content)
                print(f"✓ Updated: {name} with guidelines from {guideline_path}")
            else:
                # Just store the path if file doesn't exist yet
                article_type_id = write_article_type(name, definition, f"FILE:{guideline_path}")
                print(f"✓ Updated: {name} with path reference {guideline_path}")

        except Exception as e:
            print(f"✗ Failed to update {name}: {e}")

    print("Article guidelines update complete!")

if __name__ == "__main__":
    main()