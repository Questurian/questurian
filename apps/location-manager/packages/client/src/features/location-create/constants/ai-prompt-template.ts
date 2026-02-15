import { IDEAL_FOR_TAG_GROUPS } from "@shared/types/location-ideal-for";

export const IDEAL_FOR_OPTION_GROUPS = IDEAL_FOR_TAG_GROUPS.map((group) => ({
  label: group.label,
  options: group.tags.map((tag) => ({ value: tag, label: tag })),
}));

export const AI_PROMPT_TEMPLATE = `I need you to generate a JSON array for batch uploading locations. Here's the format:

## Required Fields:
- **name** (string) - Location name (e.g., "Asu Restaurant", "The Rooftop Bar")
- **address** (string) - Full address including city and country
- **category** (string) - One of: "dining", "accommodations", "attractions", "nightlife"
- **idealFor** (array) - 1 to 4 tags from this list:

  Occasions & Company: "Birthdays & Celebrations", "Business Dining", "Date Nights", "Family-Friendly", "First Dates", "Impressing Visitors", "Large Groups & Parties", "Pre-Theater", "Private Dining", "Catch-Up Conversations", "Friends' Night Out", "Solo Dining", "Special Occasions"

  Meal Moments: "Afternoon & Daytime Drinks", "Breakfast", "Brunch", "Coffee & Light Bites", "Happy Hour", "Late-Night & Party Scene", "Late-Night Cravings", "Lunch"

  Dining Style: "Budget-Friendly", "Casual Dining", "Classic & Traditional", "Experiential Dining", "Fine Dining", "Healthy Eating", "Tapas & Small Plates"

  Drinks & Nightlife: "Craft Beer", "Craft Cocktails", "Live Music", "Sports Bar", "Trendy Hot Spots", "Wine Bars"

  Service & Atmosphere: "BYOB-Friendly", "Bar Seating", "Outdoor Seating", "Takeout & Delivery", "Walk-In Friendly"

## Optional Fields:
- **type** (string) - Specific type like "Italian Restaurant", "Boutique Hotel", etc.
- **tripadvisorUrl** (string) - Full TripAdvisor URL

## TripAdvisor URL Format:
Example: https://www.tripadvisor.com/Restaurant_Review-g294316-d23520604-Reviews-Asu-Lima_Lima_Region.html

Breakdown:
- Restaurant_Review = Type (Restaurant_Review, Hotel_Review, Attraction_Review)
- g294316 = City/Region ID
- d23520604 = Location ID (this is what we extract)
- Asu = Location name slug
- Lima_Lima_Region = City and region

## Example Output:
\`\`\`json
[
  {
    "name": "Asu",
    "address": "Av. La Mar 1337, Miraflores, Lima, Peru",
    "category": "dining",
    "idealFor": ["Date Nights", "Fine Dining", "Impressing Visitors"],
    "tripadvisorUrl": "https://www.tripadvisor.com/Restaurant_Review-g294316-d23520604-Reviews-Asu-Lima_Lima_Region.html"
  },
  {
    "name": "The Rooftop Bar",
    "address": "456 Ocean Drive, Miami Beach, FL, USA",
    "category": "nightlife",
    "idealFor": ["Trendy Hot Spots", "Craft Cocktails"]
  }
]
\`\`\`

Please generate the JSON for these locations:
[PASTE YOUR LOCATIONS HERE]`;
