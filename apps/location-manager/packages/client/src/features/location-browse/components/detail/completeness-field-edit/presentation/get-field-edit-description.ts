import type { FieldDef } from "../completeness-field-edit.types";

export function getFieldEditDescription(field: FieldDef, category: string) {
  switch (field.key) {
    case "media":
      return "Edit below in the Images/Instagram section.";
    case "contactUrl":
      return "Google URL is generated from Name + Source Address. Click Save to regenerate.";
    case "type":
      if (category === "dining") return "Venue format only. Use cuisines for food identity and dishes.";
      break;
    case "cuisines":
      return "Food identity only. Choose cuisine, dish, or food style tags.";
    case "neighborhoodDescription":
      return "Write a short neighborhood overview, or use AI to draft one from the current district and location context before saving.";
    case "locationKey":
    case "district":
      return "Use the builder to set country, city, and barrio/district. New taxonomy keys save as approved.";
    case "operationHours":
      return "Set opening hours for each day. Use Closed or add one or more time ranges.";
    case "coordinates":
      return "Use decimal latitude/longitude values. Latitude: -90 to 90, longitude: -180 to 180.";
    case "slug":
      return "Slug is system-managed in this flow. Update related core fields to generate it.";
  }
  return field.present
    ? `Update the current ${field.label.toLowerCase()} for this location.`
    : `Add or update the missing ${field.label.toLowerCase()} for this location.`;
}
