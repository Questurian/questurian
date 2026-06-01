import type { UseFormReturn } from "react-hook-form";
import type { GooglePrefillResponse } from "@client/shared/services/api/types";
import {
  PARKING_VALUES,
  PERFECT_FOR_VALUES,
  POOL_VALUES,
  PRICE_VALUES,
} from "../../constants/accommodations-options";
import type { AddAccommodationsFormData } from "../../validation/add-accommodations.schema";
import type { ApiFilledField } from "../accommodations-create.types";

function isAllowedValue<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[]
): value is T {
  return Boolean(value && (allowed as readonly string[]).includes(value));
}

function filterAllowedValues<T extends string>(values: string[] | undefined, allowed: readonly T[]): T[] {
  if (!values) return [];
  const allowedSet = new Set<string>(allowed);
  return Array.from(new Set(values)).filter((value): value is T => allowedSet.has(value));
}

function setPrefilledValue<TField extends keyof AddAccommodationsFormData>(
  form: UseFormReturn<AddAccommodationsFormData>,
  fields: Set<ApiFilledField>,
  field: TField,
  value: AddAccommodationsFormData[TField],
  markFilled = true
) {
  form.setValue(field, value as never, {
    shouldDirty: true,
    shouldValidate: true,
    shouldTouch: true,
  });
  if (markFilled) fields.add(field as ApiFilledField);
}

export function applyGooglePrefill(
  form: UseFormReturn<AddAccommodationsFormData>,
  prefill: GooglePrefillResponse
) {
  const apiFilledFields = new Set<ApiFilledField>();
  const enrichmentFields: string[] = [];

  setPrefilledValue(form, apiFilledFields, "placeId", prefill.placeId);
  setPrefilledValue(form, apiFilledFields, "latitude", String(prefill.lat));
  setPrefilledValue(form, apiFilledFields, "longitude", String(prefill.lng));
  setPrefilledValue(form, apiFilledFields, "googleUrl", prefill.googleUrl);
  setPrefilledValue(form, apiFilledFields, "googleMapsUrl", prefill.googleUrl);
  setPrefilledValue(form, apiFilledFields, "locationKey", prefill.locationKey || "", Boolean(prefill.locationKey));
  setPrefilledValue(form, apiFilledFields, "district", prefill.district || "", Boolean(prefill.district));
  setPrefilledValue(form, apiFilledFields, "ianaTimeId", prefill.ianaTimeId || "", Boolean(prefill.ianaTimeId));

  if (prefill.phoneNumber) setPrefilledValue(form, apiFilledFields, "phone", prefill.phoneNumber);
  if (prefill.website) setPrefilledValue(form, apiFilledFields, "websiteUrl", prefill.website);

  const hints = prefill.accommodationsHints;
  const priceHint = hints?.price || prefill.priceLevel;
  if (isAllowedValue(priceHint, PRICE_VALUES)) {
    setPrefilledValue(form, apiFilledFields, "price", priceHint);
    enrichmentFields.push("price");
  }

  const perfectForHints = filterAllowedValues(hints?.perfectFor, PERFECT_FOR_VALUES);
  if (perfectForHints.length > 0) {
    setPrefilledValue(form, apiFilledFields, "perfectFor", perfectForHints);
    enrichmentFields.push("perfect for");
  }

  if (isAllowedValue(hints?.ac, ["yes", "no"] as const)) {
    setPrefilledValue(form, apiFilledFields, "ac", hints.ac);
    enrichmentFields.push("AC");
  }
  if (isAllowedValue(hints?.wifi, ["yes", "no"] as const)) {
    setPrefilledValue(form, apiFilledFields, "wifi", hints.wifi);
    enrichmentFields.push("wifi");
  }

  const parkingHints = filterAllowedValues(hints?.parking, PARKING_VALUES);
  if (parkingHints.length > 0) {
    setPrefilledValue(form, apiFilledFields, "parking", parkingHints);
    enrichmentFields.push("parking");
  }

  const poolHints = filterAllowedValues(hints?.pool, POOL_VALUES);
  if (poolHints.length > 0) {
    setPrefilledValue(form, apiFilledFields, "pool", poolHints);
    enrichmentFields.push("pool");
  }

  return { apiFilledFields, enrichmentFields };
}
