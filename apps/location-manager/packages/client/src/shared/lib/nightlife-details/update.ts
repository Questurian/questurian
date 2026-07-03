import type { NightlifeFieldKey } from "./config";
import type { NightlifeFieldUpdatePayload } from "./types";
import { cloneNightlifeDetails, normalizeSingleValue, setNightlifeFieldValue } from "./values";

export function buildNightlifeFieldUpdatePayload(
  currentDetails: unknown,
  fieldKey: NightlifeFieldKey,
  value: string | string[]
): NightlifeFieldUpdatePayload {
  const nightlifeDetails = cloneNightlifeDetails(currentDetails);
  setNightlifeFieldValue(nightlifeDetails, fieldKey, value);

  return {
    nightlifeDetails,
    ...(fieldKey === "nightlife.clubType"
      ? { type: normalizeSingleValue(value) }
      : {}),
    ...(fieldKey === "nightlife.priceTier"
      ? { priceLevel: normalizeSingleValue(value) }
      : {}),
  };
}
