import type { LocationCategory } from "../../models/location";

const CATEGORY_VALUES: readonly LocationCategory[] = [
  "dining",
  "accommodations",
  "attractions",
  "nightlife",
  "key_locations",
];

export function assertCategory(category: unknown): LocationCategory {
  if (typeof category === "string" && CATEGORY_VALUES.includes(category as LocationCategory)) {
    return category as LocationCategory;
  }
  throw new Error(`Invalid location category in database row: ${String(category)}`);
}

export function stripNightlifeSpendLevel(details: Record<string, unknown>): Record<string, unknown> {
  const detailsNode = details.details;
  if (!detailsNode || typeof detailsNode !== "object" || Array.isArray(detailsNode)) {
    return details;
  }

  const detailsRecord = detailsNode as Record<string, unknown>;
  const sceneNode = detailsRecord.theScene;
  if (!sceneNode || typeof sceneNode !== "object" || Array.isArray(sceneNode)) {
    return details;
  }

  const sceneRecord = sceneNode as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(sceneRecord, "spendLevel")) {
    return details;
  }

  const nextScene = { ...sceneRecord };
  delete nextScene.spendLevel;

  return {
    ...details,
    details: {
      ...detailsRecord,
      theScene: nextScene,
    },
  };
}
