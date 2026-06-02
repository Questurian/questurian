import type { LocationResponse } from "@client/shared/services/api/types";
import { getAccommodationsCompletenessFields } from "./accommodations";
import { getAttractionsCompletenessFields } from "./attractions";
import { createCompletenessFieldContext } from "./common";
import { getDefaultCompletenessFields } from "./default";
import { getKeyLocationsCompletenessFields } from "./key-locations";
import { getNightlifeCompletenessFields } from "./nightlife";
import type { CompletenessField } from "./types";

export type { CompletenessField } from "./types";
export { getCompletenessEditField, isReadOnlyCompletenessField } from "./edit-field";
export { getImportantOptionalCompletenessFields } from "./optional";

export function getLocationCompletenessFields(locationDetail: LocationResponse): CompletenessField[] {
  const context = createCompletenessFieldContext(locationDetail);

  if (locationDetail.category === "nightlife") {
    return getNightlifeCompletenessFields(context);
  }
  if (locationDetail.category === "accommodations") {
    return getAccommodationsCompletenessFields(context);
  }
  if (locationDetail.category === "attractions") {
    return getAttractionsCompletenessFields(context);
  }
  if (locationDetail.category === "key_locations") {
    return getKeyLocationsCompletenessFields(context);
  }

  return getDefaultCompletenessFields(context);
}
