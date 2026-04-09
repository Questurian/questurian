import type { LocationCategory } from "@shared/types/location-category";
import { getIdealForGroups, getIdealForTags } from "@shared/types/location-ideal-for";

const CATEGORY_LABELS: Record<LocationCategory, string> = {
  dining: "Dining",
  accommodations: "Accommodations",
  attractions: "Attractions",
  nightlife: "Nightlife",
  key_locations: "Key Locations",
};

const CATEGORY_ORDER: LocationCategory[] = [
  "dining",
  "accommodations",
  "attractions",
  "nightlife",
  "key_locations",
];

function categoryUsesIdealFor(category: LocationCategory) {
  return category === "dining" || category === "nightlife";
}

export function getIdealForOptionGroups(category: LocationCategory) {
  if (!categoryUsesIdealFor(category)) {
    return [];
  }

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
    if (!categoryUsesIdealFor(category)) {
      return "";
    }
    return `Use only ${CATEGORY_LABELS[category]} tags:\n${renderTagGroupsForCategory(category)}`;
  }

  return CATEGORY_ORDER
    .filter(categoryUsesIdealFor)
    .map((itemCategory) => {
      return `### ${CATEGORY_LABELS[itemCategory]} tags\n${renderTagGroupsForCategory(itemCategory)}`;
    })
    .join("\n\n");
}

export function buildAiPromptTemplate(category?: LocationCategory | null): string {
  const categoryLine = category
    ? `- **category** (string) - Must be "${category}"`
    : '- **category** (string) - One of: "dining", "accommodations", "attractions", "nightlife", "key_locations"';

  const categoryExample = category || "dining";
  const exampleUsesIdealFor = categoryUsesIdealFor(categoryExample);
  const requiredIdealForLine = category
    ? categoryUsesIdealFor(category)
      ? '- **idealFor** (array) - 1 to 4 tags from the matching category list'
      : ""
    : '- **idealFor** (array, dining/nightlife only) - 1 to 4 tags from the matching category list';
  const idealForSection = buildIdealForInstructions(category);
  const idealForRules = category
    ? categoryUsesIdealFor(category)
      ? "- Each item's `idealFor` must use tags from that item's `category` only.\n- Never mix tags across categories.\n- Keep `idealFor` unique (no duplicates)."
      : '- Do not include `idealFor` for this category.'
    : "- Include `idealFor` only for dining and nightlife items.\n- Each dining/nightlife item's `idealFor` must use tags from that item's `category` only.\n- Never mix tags across categories.\n- Keep `idealFor` unique (no duplicates).";
  const exampleIdealFor = exampleUsesIdealFor
    ? `,\n    "idealFor": ["${getIdealForTags(categoryExample)[0]}"]`
    : "";

  return `I need you to generate a JSON array for batch uploading locations. Here's the format:

## Required Fields:
- **name** (string) - Location name
- **address** (string) - Full address including city and country
${categoryLine}
${requiredIdealForLine}

## Ideal For Tags (category-specific):
${idealForSection || "- Not used for this category."}

## Validation Rules:
${idealForRules}

## Optional Fields:
- **type** (string) - Specific type like "Italian Restaurant", "Boutique Hotel", "Museum", etc.
- **tripadvisorUrl** (string) - Full TripAdvisor URL

## Example Output:
\`\`\`json
[
  {
    "name": "Sample Location",
    "address": "123 Example St, Lima, Peru",
    "category": "${categoryExample}"${exampleIdealFor}
  }
]
\`\`\`

Please generate the JSON for these locations:
[PASTE YOUR LOCATIONS HERE]`;
}

export const AI_PROMPT_TEMPLATE = buildAiPromptTemplate(null);
