#!/usr/bin/env python3
"""
Script to populate the article_types table with existing hardcoded data.

Run this once to initialize the database with article types and definitions.
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

# Article types and their definitions (copied from stages.py and stage_2.py)
ARTICLE_TYPE_DATA = [
    ("How-to Guides", "Teaches a process, steps, or methods to achieve an outcome."),
    ("Disqualifiers", "Warns who should NOT do something or filters an audience."),
    ("Opinion Piece", "Expresses personal beliefs, judgments, or persuasion."),
    ("In-depth Analysis", "Explains causes, systems, trade-offs, or frameworks deeply."),
    ("Interview", "Structured Q&A between two or more speakers."),
    ("News Article", "Reports timely facts or announcements neutrally."),
    ("Feature Story", "Narrative-driven, human-focused storytelling."),
    ("Case Study", "Real example showing problem → action → result."),
    ("Listicle", "Content structured primarily as a list or ranked items."),
    ("Explainer", "Breaks down a concept simply (e.g., \"What Is Travel Insurance?\")."),
    ("Beginner's Guide", "Assumes zero knowledge to introduce a topic."),
    ("FAQ Article", "Question-driven education answering common queries."),
    ("Myth-Busting Article", "Corrects common misconceptions."),
    ("Comparison Article", "Evaluates multiple options against each other (A vs. B)."),
    ("Buyer's Guide", "Helps readers choose between products or services."),
    ("Review", "Evaluates a single product, service, or place in depth."),
    ("Roundup", "Summarizes multiple options with brief evaluations."),
    ("Best Of", "Curates top recommendations in a category."),
    ("Cost Breakdown", "Transparently details prices or budgets."),
    ("Checklist", "Actionable, scannable to-do or packing lists."),
    ("Resource List", "Curated list of tools, links, or services."),
    ("Survival Guide", "Provides practical advice for challenging situations."),
    ("Destination Guide", "Comprehensive overview of a place's highlights, logistics, and tips."),
    ("Itinerary Article", "Day-by-day travel plan or sequence of activities."),
    ("Travel Diary", "Personal narrative or trip report recounting experiences chronologically."),
    ("Where to Stay Guide", "Advises on neighborhoods, lodging types, and accommodation tips."),
    ("When to Visit Article", "Covers seasons, weather, crowds, and timing considerations."),
    ("Budget Travel Guide", "Focuses on saving money and cost-effective strategies."),
    ("Luxury Travel Guide", "Highlights premium experiences and upscale options."),
    ("Solo Travel Guide", "Tailors advice for individual travelers, safety, and logistics."),
    ("Family Travel Guide", "Offers kid-friendly planning and tips for all ages."),
    ("Digital Nomad Guide", "Blends work and travel logistics for long-term stays."),
    ("Packing Guide", "Recommends essential items to bring for specific trips."),
    ("Visa & Entry Guide", "Outlines visa requirements, paperwork, and border protocols."),
    ("Safety Guide", "Addresses risks, scams, and precautions."),
    ("Cultural Etiquette Guide", "Explains local customs, do's and don'ts."),
    ("Transportation Guide", "Describes getting around (trains, buses, rentals, passes)."),
    ("Travel Inspiration Piece", "Emotional or aspirational content to spark wanderlust."),
    ("Hidden Gems Article", "Uncovers lesser-known or off-the-beaten-path spots."),
    ("Food Travel Guide", "Explores culinary highlights, local dishes, and dining tips."),
    ("Adventure Guide", "Focuses on activities like hiking, diving, trekking, or other adventures."),
]


def main():
    """Populate the article_types table."""
    print(f"Populating {len(ARTICLE_TYPE_DATA)} article types...")

    for name, definition in ARTICLE_TYPE_DATA:
        try:
            article_type_id = write_article_type(name, definition)
            print(f"✓ Added/Updated: {name} (ID: {article_type_id})")
        except Exception as e:
            print(f"✗ Failed to add {name}: {e}")

    print("Article types population complete!")


if __name__ == "__main__":
    main()