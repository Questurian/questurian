import type { LocationCategory } from "@shared/types/location-category";
import { getIdealForGroups, getIdealForTags } from "@shared/types/location-ideal-for";

const CATEGORY_LABELS: Record<LocationCategory, string> = {
  dining: "Dining",
  accommodations: "Accommodations",
  attractions: "Attractions",
  nightlife: "Nightlife",
};

const CATEGORY_ORDER: LocationCategory[] = [
  "dining",
  "accommodations",
  "attractions",
  "nightlife",
];

export function getIdealForOptionGroups(category: LocationCategory) {
  return getIdealForGroups(category).map((group) => ({
    label: group.label,
    options: group.tags.map((tag) => ({ value: tag, label: tag })),
  }));
}

function renderTagGroupsForCategory(category: LocationCategory): string {
  const groups = getIdealForGroups(category);

  return groups
    .map((group) => {
      const tags = group.tags.map((tag) => `"${tag}"`).join(", ");
      return `- ${group.label}: ${tags}`;
    })
    .join("\n");
}

function buildIdealForInstructions(category?: LocationCategory | null): string {
  if (category) {
    return `Use only ${CATEGORY_LABELS[category]} tags:\n${renderTagGroupsForCategory(category)}`;
  }

  return CATEGORY_ORDER
    .map((itemCategory) => {
      return `### ${CATEGORY_LABELS[itemCategory]} tags\n${renderTagGroupsForCategory(itemCategory)}`;
    })
    .join("\n\n");
}

export function buildAiPromptTemplate(category?: LocationCategory | null): string {
  const categoryLine = category
    ? `- **category** (string) - Must be "${category}"`
    : '- **category** (string) - One of: "dining", "accommodations", "attractions", "nightlife"';

  const categoryExample = category || "dining";

  return `I need you to generate a JSON array for batch uploading locations. Here's the format:

## Required Fields:
- **name** (string) - Location name
- **address** (string) - Full address including city and country
${categoryLine}
- **idealFor** (array) - 1 to 4 tags from the matching category list

## Ideal For Tags (category-specific):
${buildIdealForInstructions(category)}

## Validation Rules:
- Each item's \`idealFor\` must use tags from that item's \`category\` only.
- Never mix tags across categories.
- Keep \`idealFor\` unique (no duplicates).

## Optional Fields:
- **type** (string) - Specific type like "Italian Restaurant", "Boutique Hotel", "Museum", etc.
- **tripadvisorUrl** (string) - Full TripAdvisor URL

## Example Output:
\`\`\`json
[
  {
    "name": "Sample Location",
    "address": "123 Example St, Lima, Peru",
    "category": "${categoryExample}",
    "idealFor": ["${getIdealForTags(categoryExample)[0]}"]
  }
]
\`\`\`

Please generate the JSON for these locations:
[PASTE YOUR LOCATIONS HERE]`;
}

export const AI_PROMPT_TEMPLATE = buildAiPromptTemplate(null);
