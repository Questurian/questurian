import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BedDouble, ChevronLeft, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Button } from "@client/components/ui/button";
import { Breadcrumbs } from "@client/shared/components/layout";
import { ErrorAlert } from "@client/shared/components/ui";
import { PhotoImportPanel } from "@client/shared/components/location-media/PhotoImportPanel";
import { locationsApi, useLocationById, useUpdateLocation } from "@client/shared/services/api";
import { LOCATION_BY_ID_QUERY_KEY } from "@client/shared/services/api/hooks/useLocationById";
import { PendingSuggestionsPanel } from "@client/features/location-edit/components/PendingSuggestionsPanel";
import { useLocationTypes } from "@client/shared/services/api/hooks/useLocationTypes";
import type { AccommodationsFieldSuggestionResponse } from "@client/shared/services/api/types";
import type { LocationCategory } from "@shared/types/location-category";
import {
  buildAccommodationsDetails,
  parseAccommodationsDetails,
} from "@client/shared/lib/accommodations-details";
import {
  addAccommodationsSchema,
  buildAccommodationsPrefillSignature,
  normalizeAccommodationsAddress,
  type AddAccommodationsFormData,
} from "../validation/add-accommodations.schema";
import {
  ACCOMMODATIONS_SUGGESTION_FIELDS,
  BOOLEAN_OPTIONS,
  CHECK_IN_TIME_OPTIONS,
  CHECK_OUT_TIME_OPTIONS,
  GYM_OPTIONS,
  JACUZZI_OPTIONS,
  PARKING_OPTIONS,
  PERFECT_FOR_OPTIONS,
  POOL_OPTIONS,
  PRICE_OPTIONS,
  type AccommodationsOption,
  type AccommodationsSuggestionFieldKey,
  VIBE_OPTIONS,
  WALKABILITY_OPTIONS,
  WORKSPACE_OPTIONS,
} from "../constants/accommodations-options";

type MultiField = "perfectFor" | "parking" | "vibe" | "workspace" | "pool" | "jacuzzi";
type AiSuggestedField = AccommodationsSuggestionFieldKey;

interface OptionSelectProps {
  label: string;
  options: AccommodationsOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  canSuggest?: boolean;
  isSuggesting?: boolean;
  onSuggest?: () => void;
}

interface MultiOptionTableProps {
  label: string;
  options: AccommodationsOption[];
  values: string[];
  onToggle: (value: string) => void;
  error?: string;
  canSuggest?: boolean;
  isSuggesting?: boolean;
  onSuggest?: () => void;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

function booleanToOptionalYesNo(value: boolean | null | undefined): "" | "yes" | "no" {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "";
}

function toBoolean(value: "yes" | "no"): boolean {
  return value === "yes";
}

function pickSingleOption<T extends readonly string[]>(
  value: string | null | undefined,
  options: T
): T[number] | "" {
  if (value && options.includes(value as T[number])) {
    return value as T[number];
  }
  return "";
}

function pickMultiOptions<T extends readonly string[]>(
  values: string[] | null | undefined,
  options: T
): T[number][] {
  if (!values || values.length === 0) return [];
  const optionSet = new Set<string>(options);
  const validValues = values.filter((value): value is T[number] => optionSet.has(value));
  if (validValues.length === 0) return [];
  return validValues;
}

function getSuggestionField(fieldKey: AiSuggestedField) {
  return ACCOMMODATIONS_SUGGESTION_FIELDS.find((field) => field.key === fieldKey);
}

function getSuggestionFieldOptions(
  fieldKey: AiSuggestedField,
  locationTypes: Array<{ value: string; label: string }>
): AccommodationsOption[] {
  if (fieldKey === "type") {
    return locationTypes.map((option) => ({
      value: option.value,
      label: option.label,
      description: "Accommodation type from the configured taxonomy.",
    }));
  }
  if (fieldKey === "checkInTime") return [...CHECK_IN_TIME_OPTIONS];
  if (fieldKey === "checkOutTime") return [...CHECK_OUT_TIME_OPTIONS];

  const field = getSuggestionField(fieldKey);
  return field && "options" in field ? [...field.options] : [];
}

function formatSuggestionValue(
  suggestion: string | string[] | null,
  options: AccommodationsOption[]
) {
  if (!suggestion) return "No suggestion";
  const labelsByValue = new Map(options.map((option) => [option.value, option.label]));
  const values = Array.isArray(suggestion) ? suggestion : [suggestion];
  return values.map((value) => labelsByValue.get(value) || value).join(", ");
}

function validateClientSuggestion(
  suggestion: string | string[] | null,
  options: AccommodationsOption[],
  isMulti: boolean
) {
  const allowed = new Set(options.map((option) => option.value));
  if (isMulti) {
    if (!Array.isArray(suggestion)) return null;
    const validValues = Array.from(
      new Set(suggestion.filter((value): value is string => typeof value === "string" && allowed.has(value)))
    );
    return validValues.length > 0 ? validValues : null;
  }

  return typeof suggestion === "string" && allowed.has(suggestion) ? suggestion : null;
}

function SuggestButton({
  label,
  isSuggesting,
  onSuggest,
}: {
  label: string;
  isSuggesting: boolean;
  onSuggest: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSuggest}
      disabled={isSuggesting}
      title={`Suggest ${label}`}
      className="inline-flex h-6 items-center gap-1 rounded-sm border border-border bg-background px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isSuggesting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Sparkles className="h-3.5 w-3.5" />
      )}
      {isSuggesting ? "Suggesting..." : "Suggest"}
    </button>
  );
}

function FieldLabel({
  label,
  canSuggest,
  isSuggesting,
  onSuggest,
}: {
  label: string;
  canSuggest?: boolean;
  isSuggesting?: boolean;
  onSuggest?: () => void;
}) {
  return (
    <Label className="flex flex-wrap items-center gap-2">
      <span>{label}</span>
      {canSuggest && onSuggest && (
        <SuggestButton label={label} isSuggesting={!!isSuggesting} onSuggest={onSuggest} />
      )}
    </Label>
  );
}

function OptionSelect({ label, options, value, onChange, error, canSuggest, isSuggesting, onSuggest }: OptionSelectProps) {
  return (
    <div className="space-y-2">
      <FieldLabel label={label} canSuggest={canSuggest} isSuggesting={isSuggesting} onSuggest={onSuggest} />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground"
      >
        <option value="" disabled>— Select —</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium w-44">Option</th>
              <th className="text-left px-2 py-1.5 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {options.map((option) => (
              <tr key={option.value} className={value === option.value ? "bg-primary/10" : "border-t border-border"}>
                <td className="px-2 py-1.5 font-medium">{option.label}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{option.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function MultiOptionTable({ label, options, values, onToggle, error, canSuggest, isSuggesting, onSuggest }: MultiOptionTableProps) {
  return (
    <div className="space-y-2">
      <FieldLabel label={label} canSuggest={canSuggest} isSuggesting={isSuggesting} onSuggest={onSuggest} />
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium w-24">Select</th>
              <th className="text-left px-2 py-1.5 font-medium w-44">Option</th>
              <th className="text-left px-2 py-1.5 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {options.map((option) => {
              const isChecked = values.includes(option.value);
              return (
                <tr key={option.value} className={isChecked ? "bg-primary/10 border-t border-border" : "border-t border-border"}>
                  <td className="px-2 py-1.5">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggle(option.value)}
                      />
                      <span className="text-[11px]">{isChecked ? "Selected" : "Select"}</span>
                    </label>
                  </td>
                  <td className="px-2 py-1.5 font-medium">{option.label}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{option.description}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SuggestionStackOverlay({
  stack,
  locationTypes,
  pendingCount,
  onApply,
  onDismiss,
}: {
  stack: AccommodationsFieldSuggestionResponse[];
  locationTypes: Array<{ value: string; label: string }>;
  pendingCount: number;
  onApply: (item: AccommodationsFieldSuggestionResponse) => void;
  onDismiss: (item: AccommodationsFieldSuggestionResponse) => void;
}) {
  if (stack.length === 0) return null;

  const top = stack[stack.length - 1]!;
  const backgroundDepth = Math.min(stack.length - 1, 2);
  const topOptions = getSuggestionFieldOptions(top.fieldKey as AiSuggestedField, locationTypes);
  const topValue = formatSuggestionValue(top.suggestion, topOptions);
  const canApply = Boolean(top.suggestion && !top.error);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-xl">
        {Array.from({ length: backgroundDepth }).map((_, i) => {
          const depth = backgroundDepth - i;
          return (
            <div
              key={i}
              className="absolute inset-0 rounded-lg border border-border bg-card"
              style={{
                transform: `translate(${depth * 8}px, ${depth * 8}px)`,
                zIndex: i,
                opacity: 1 - depth * 0.2,
              }}
            />
          );
        })}

        <div
          className="relative rounded-lg border border-border bg-card shadow-2xl"
          style={{ zIndex: backgroundDepth + 1 }}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky-400" />
              <span className="font-semibold text-foreground">
                {top.fieldLabel || top.fieldKey}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {stack.length > 1 && (
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {stack.length - 1} more ready
                </span>
              )}
              {pendingCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {pendingCount} fetching
                </span>
              )}
            </div>
          </div>

          <div className="space-y-4 p-5 text-sm">
            <div className="rounded-md border border-border bg-muted/25 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Proposed value
              </div>
              <div className="mt-1 text-base font-semibold text-foreground">{topValue || "—"}</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Confidence
                </div>
                <div className="mt-1 text-foreground">{Math.round(top.confidence * 100)}%</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Evidence
                </div>
                <div className="mt-1 text-foreground">
                  {top.source === "existing-data" ? "Google/Foursquare" : "Gemini grounded search"}
                </div>
              </div>
            </div>

            {top.reason && (
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Reason
                </div>
                <p className="mt-1 leading-relaxed text-foreground">{top.reason}</p>
              </div>
            )}

            {top.sources && top.sources.length > 0 && (
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Sources
                </div>
                <div className="mt-2 space-y-2">
                  {top.sources.map((source, idx) => (
                    <div key={`${source.label}-${idx}`} className="rounded-md border border-border p-2">
                      {source.url ? (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          {source.label}
                        </a>
                      ) : (
                        <div className="font-medium text-foreground">{source.label}</div>
                      )}
                      {source.snippet && (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {source.snippet}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {top.error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                {top.error}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <Button type="button" variant="outline" onClick={() => onDismiss(top)}>
              Dismiss
            </Button>
            <Button type="button" disabled={!canApply} onClick={() => onApply(top)}>
              Apply suggestion
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_FORM_VALUES = {
  name: "",
  title: "",
  address: "",
  type: "",
  price: "",
  perfectFor: [],
  kidFriendly: "",
  ac: "",
  wifi: "",
  extraGuestFee: "",
  parking: [],
  breakfastServed: "",
  vibe: [],
  workspace: [],
  restaurant: "",
  pool: [],
  rooftopLounge: "",
  jacuzzi: [],
  gym: "",
  walkability: "",
  checkInTime: "",
  checkOutTime: "",
  phone: "",
  websiteUrl: "",
  bookingUrl: "",
  googleMapsUrl: "",
  googleUrl: "",
  placeId: "",
  latitude: "",
  longitude: "",
  locationKey: "",
  district: "",
  ianaTimeId: "",
} as unknown as AddAccommodationsFormData;

export function EditAccommodationsLocation() {
  const { id, category } = useParams<{ id: string; category: LocationCategory }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const locationId = id ? Number.parseInt(id, 10) : null;

  const [isPrefillingGoogle, setIsPrefillingGoogle] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillSignature, setPrefillSignature] = useState<string | null>(null);
  const [pendingFields, setPendingFields] = useState<Set<AiSuggestedField>>(() => new Set());
  const [suggestionStack, setSuggestionStack] = useState<AccommodationsFieldSuggestionResponse[]>([]);
  const [bookingSuggestState, setBookingSuggestState] = useState<
    { status: "idle" } | { status: "busy" } | { status: "error"; message: string }
  >({ status: "idle" });

  const { data: location, isLoading, error: fetchError } = useLocationById(locationId, "accommodations");
  const { mutate: updateLocation, isPending, error: updateError } = useUpdateLocation();
  const { data: locationTypes = [], isLoading: isLoadingTypes } = useLocationTypes("accommodations");

  const form = useForm<AddAccommodationsFormData>({
    resolver: zodResolver(addAccommodationsSchema),
    defaultValues: DEFAULT_FORM_VALUES,
    mode: "onChange",
  });

  const prefillIsStale = useMemo(() => {
    if (!prefillSignature) return false;
    const current = buildAccommodationsPrefillSignature(
      form.watch("name"),
      form.watch("address")
    );
    return current !== prefillSignature;
  }, [form, prefillSignature]);

  const needsTitleBackfill = useMemo(() => {
    if (!location) return false;
    if (location.title?.trim()) return false;
    const details = parseAccommodationsDetails(location.accommodationsDetails);
    return Boolean(location.source.name?.trim() || details.coreName?.trim());
  }, [location]);

  useEffect(() => {
    if (!location) return;

    const details = parseAccommodationsDetails(location.accommodationsDetails);

    const values = {
      name: location.source.name || details.coreName || DEFAULT_FORM_VALUES.name,
      title:
        location.title?.trim() ||
        location.source.name ||
        details.coreName ||
        DEFAULT_FORM_VALUES.title,
      address: location.source.address || details.address || DEFAULT_FORM_VALUES.address,
      type: location.type || details.coreType || "",
      price: pickSingleOption(details.corePrice || location.priceLevel || null, ["$", "$$", "$$$", "$$$$"] as const),
      perfectFor: pickMultiOptions(details.perfectFor, ["Solo", "Couples", "Groups"] as const),
      kidFriendly: booleanToOptionalYesNo(details.kidFriendly),
      ac: booleanToOptionalYesNo(details.ac),
      wifi: booleanToOptionalYesNo(details.wifi),
      extraGuestFee: booleanToOptionalYesNo(details.extraGuestFee),
      parking: pickMultiOptions(details.parking, ["none", "onsite", "valet", "street", "garage"] as const),
      breakfastServed: booleanToOptionalYesNo(details.breakfastServed),
      vibe: pickMultiOptions(
        details.vibe,
        ["Luxury", "Social", "Quiet", "Boutique", "Family-Friendly", "Business-Friendly"] as const
      ),
      workspace: pickMultiOptions(
        details.workspace,
        ["None", "Shared Lounge", "Dedicated Desk", "Co-working Space"] as const
      ),
      restaurant: booleanToOptionalYesNo(details.restaurant),
      pool: pickMultiOptions(details.pool, ["none", "indoor", "outdoor", "rooftop", "infinity"] as const),
      rooftopLounge: booleanToOptionalYesNo(details.rooftopLounge),
      jacuzzi: pickMultiOptions(details.jacuzzi, ["none", "private", "shared", "rooftop"] as const),
      gym: pickSingleOption(details.gym, ["None", "Basic", "Full", "24/7"] as const),
      walkability: pickSingleOption(
        details.walkability,
        ["Walkable Downtown", "Transit-Friendly", "Car Needed", "Secluded"] as const
      ),
      checkInTime: details.checkInTime || DEFAULT_FORM_VALUES.checkInTime,
      checkOutTime: details.checkOutTime || DEFAULT_FORM_VALUES.checkOutTime,
      phone: location.contact.phoneNumber || details.phone || "",
      websiteUrl: location.contact.website || details.websiteUrl || "",
      bookingUrl: details.bookingUrl || "",
      googleMapsUrl: details.googleMapsUrl || location.contact.url || "",
      googleUrl: location.contact.url || details.googleMapsUrl || "",
      placeId: location.placeId || "",
      latitude: location.coordinates.lat != null ? String(location.coordinates.lat) : "",
      longitude: location.coordinates.lng != null ? String(location.coordinates.lng) : "",
      locationKey: location.locationKey || "",
      district: location.district || details.coreDistrict || "",
      ianaTimeId: location.ianaTimeId || "",
    } as unknown as AddAccommodationsFormData;

    form.reset(values);
    setPrefillSignature(buildAccommodationsPrefillSignature(values.name, values.address));
  }, [location, form]);

  const toggleMultiOption = (field: MultiField, value: string) => {
    const currentValues = (form.getValues(field) || []) as string[];
    const nextValues = currentValues.includes(value)
      ? currentValues.filter((item) => item !== value)
      : [...currentValues, value];

    form.setValue(field, nextValues as AddAccommodationsFormData[MultiField], {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });
  };

  const handleGooglePrefill = async () => {
    setPrefillError(null);
    setPrefillMessage(null);

    const isStepValid = await form.trigger(["name", "address"]);
    if (!isStepValid) {
      setPrefillError("Enter a valid name and address before running Google lookup.");
      return;
    }

    const name = form.getValues("name").trim();
    const normalizedAddress = normalizeAccommodationsAddress(form.getValues("address"));
    form.setValue("address", normalizedAddress, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });

    setIsPrefillingGoogle(true);
    try {
      const prefill = await locationsApi.googlePrefill("accommodations", {
        name,
        address: normalizedAddress,
      });

      form.setValue("placeId", prefill.placeId, { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      form.setValue("latitude", String(prefill.lat), { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      form.setValue("longitude", String(prefill.lng), { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      form.setValue("googleUrl", prefill.googleUrl, { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      form.setValue("googleMapsUrl", prefill.googleUrl, { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      form.setValue("locationKey", prefill.locationKey || "", { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      form.setValue("district", prefill.district || "", { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      form.setValue("ianaTimeId", prefill.ianaTimeId || "", { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      if (prefill.phoneNumber) {
        form.setValue("phone", prefill.phoneNumber, { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      }
      if (prefill.website) {
        form.setValue("websiteUrl", prefill.website, { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      }

      setPrefillSignature(buildAccommodationsPrefillSignature(name, normalizedAddress));
      setPrefillMessage(
        "Google lookup complete. Place ID, coordinates, location key, district, time zone, phone, and website were refreshed."
      );
    } catch (lookupError) {
      setPrefillError(getErrorMessage(lookupError));
    } finally {
      setIsPrefillingGoogle(false);
    }
  };

  const queueSuggestion = async (fieldKey: AiSuggestedField) => {
    const field = getSuggestionField(fieldKey);
    const allowedOptions = getSuggestionFieldOptions(fieldKey, locationTypes);
    const isUrlKind = field?.kind === "url";
    if (!field || (!isUrlKind && allowedOptions.length === 0) || locationId === null) return;

    setPendingFields((prev) => new Set(prev).add(fieldKey));

    try {
      const response = await locationsApi.suggestField({
        category: "accommodations",
        locationId,
        fieldKey,
        formValues: form.getValues() as unknown as Record<string, unknown>,
        apiContext: {
          googleUrl: form.getValues("googleUrl") || null,
          placeId: form.getValues("placeId") || null,
          locationKey: form.getValues("locationKey") || null,
          district: form.getValues("district") || null,
          ianaTimeId: form.getValues("ianaTimeId") || null,
          phoneNumber: form.getValues("phone") || null,
          website: form.getValues("websiteUrl") || null,
        },
        allowedOptions,
      });
      setSuggestionStack((prev) => [...prev, response]);
    } catch (err) {
      setSuggestionStack((prev) => [
        ...prev,
        {
          fieldKey,
          fieldLabel: field.label,
          suggestion: null,
          kind: field.kind,
          confidence: 0,
          source: "ai",
          reason: "",
          sources: [],
          error: getErrorMessage(err),
        },
      ]);
    } finally {
      setPendingFields((prev) => {
        const next = new Set(prev);
        next.delete(fieldKey);
        return next;
      });
    }
  };

  const applyStackedSuggestion = (item: AccommodationsFieldSuggestionResponse) => {
    const fieldKey = item.fieldKey as AiSuggestedField;
    const allowedOptions = getSuggestionFieldOptions(fieldKey, locationTypes);
    const validatedSuggestion = validateClientSuggestion(
      item.suggestion,
      allowedOptions,
      item.kind === "multi"
    );

    if (validatedSuggestion) {
      form.setValue(fieldKey, validatedSuggestion as AddAccommodationsFormData[typeof fieldKey], {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
    }
    setSuggestionStack((prev) => prev.filter((s) => s !== item));
  };

  const dismissStackedSuggestion = (item: AccommodationsFieldSuggestionResponse) => {
    setSuggestionStack((prev) => prev.filter((s) => s !== item));
  };

  const canSuggest = (fieldKey: AiSuggestedField) => {
    const name = form.watch("name")?.trim();
    const address = form.watch("address")?.trim();
    const field = getSuggestionField(fieldKey);
    const options = getSuggestionFieldOptions(fieldKey, locationTypes);
    return Boolean(name && address && field && (field.kind === "url" || options.length > 0));
  };

  const suggestProps = (fieldKey: AiSuggestedField) => ({
    canSuggest: canSuggest(fieldKey),
    isSuggesting: pendingFields.has(fieldKey),
    onSuggest: () => void queueSuggestion(fieldKey),
  });

  const handleBookingUrlSuggest = async () => {
    if (!locationId) return;
    setBookingSuggestState({ status: "busy" });
    try {
      await locationsApi.proposePendingSuggestion(locationId, "bookingUrl");
      await queryClient.invalidateQueries({
        queryKey: LOCATION_BY_ID_QUERY_KEY("accommodations", locationId),
      });
      setBookingSuggestState({ status: "idle" });
    } catch (err) {
      setBookingSuggestState({
        status: "error",
        message: err instanceof Error ? err.message : "Suggest failed",
      });
    }
  };

  const handleSubmit = (data: AddAccommodationsFormData) => {
    if (!locationId) return;

    const normalizedAddress = normalizeAccommodationsAddress(data.address);

    const accommodationsDetails = buildAccommodationsDetails({
      name: data.name,
      price: data.price,
      district: data.district || "",
      type: data.type,
      perfectFor: data.perfectFor,
      kidFriendly: toBoolean(data.kidFriendly),
      ac: toBoolean(data.ac),
      wifi: toBoolean(data.wifi),
      extraGuestFee: toBoolean(data.extraGuestFee),
      parking: data.parking,
      breakfastServed: toBoolean(data.breakfastServed),
      vibe: data.vibe,
      workspace: data.workspace,
      restaurant: toBoolean(data.restaurant),
      pool: data.pool,
      rooftopLounge: toBoolean(data.rooftopLounge),
      jacuzzi: data.jacuzzi,
      gym: data.gym,
      address: normalizedAddress,
      walkability: data.walkability,
      checkInTime: data.checkInTime,
      checkOutTime: data.checkOutTime,
      phone: data.phone,
      websiteUrl: data.websiteUrl,
      bookingUrl: data.bookingUrl || "",
      googleMapsUrl: data.googleMapsUrl || "",
    });

    updateLocation(
      {
        category: "accommodations",
        id: locationId,
        data: {
          name: data.name,
          title: data.title?.trim() || undefined,
          address: normalizedAddress,
          type: data.type,
          priceLevel: data.price,
          phoneNumber: data.phone || undefined,
          website: data.websiteUrl || undefined,
          district: data.district || undefined,
          locationKey: data.locationKey || undefined,
          ianaTimeId: data.ianaTimeId || undefined,
          placeId: data.placeId || undefined,
          accommodationsDetails,
        },
      },
      {
        onSuccess: () => navigate("/"),
      }
    );
  };

  if (category !== "accommodations") {
    return (
      <div className="max-w-[1200px] mx-auto">
        <Breadcrumbs items={[{ label: "Edit Accommodations" }]} />
        <ErrorAlert title="Invalid route" message="This editor is only available for accommodations." />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <Breadcrumbs items={[{ label: "Edit Accommodations" }]} />
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Loading accommodations...
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <Breadcrumbs items={[{ label: "Edit Accommodations" }]} />
        <ErrorAlert title="Error loading accommodations" message={fetchError.message} />
      </div>
    );
  }

  if (!location) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <Breadcrumbs items={[{ label: "Edit Accommodations" }]} />
        <ErrorAlert title="Not found" message="Accommodations location not found." />
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      <Breadcrumbs items={[{ label: location.title || location.source.name || "Edit Accommodations" }]} />
      <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <BedDouble className="w-4 h-4 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground underline">
              Edit Accommodations
            </h1>
          </div>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>

        <div className="mb-6">
          <PhotoImportPanel
            locationId={location.id}
            category="accommodations"
            placeId={location.placeId ?? null}
          />
        </div>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          {locationId && (
            <PendingSuggestionsPanel
              locationId={locationId}
              category="accommodations"
              pending={location.pendingSuggestions}
            />
          )}

          <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">Step 1 + Entities</h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleGooglePrefill()}
                disabled={isPrefillingGoogle || isPending}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isPrefillingGoogle ? "animate-spin" : ""}`} />
                {isPrefillingGoogle ? "Refreshing..." : "Google Re-Prefill"}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input placeholder="Location Name" {...form.register("name")} />
                {form.formState.errors.name && (
                  <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  placeholder="Display title (listings, CMS)"
                  {...form.register("title")}
                />
                <p className="text-[11px] text-muted-foreground">
                  Public display name. Can differ from the maps/source name above.
                </p>
                {form.formState.errors.title && (
                  <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input placeholder="Location Address" {...form.register("address")} />
                {form.formState.errors.address && (
                  <p className="text-xs text-destructive">{form.formState.errors.address.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Google URL</Label>
                <Input placeholder="https://www.google.com/maps/..." {...form.register("googleUrl")} />
                {form.formState.errors.googleUrl && (
                  <p className="text-xs text-destructive">{form.formState.errors.googleUrl.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Place ID</Label>
                <Input placeholder="ChIJ..." {...form.register("placeId")} />
                {form.formState.errors.placeId && (
                  <p className="text-xs text-destructive">{form.formState.errors.placeId.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Latitude</Label>
                <Input placeholder="25.7743" {...form.register("latitude")} />
                {form.formState.errors.latitude && (
                  <p className="text-xs text-destructive">{form.formState.errors.latitude.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Longitude</Label>
                <Input placeholder="-80.1937" {...form.register("longitude")} />
                {form.formState.errors.longitude && (
                  <p className="text-xs text-destructive">{form.formState.errors.longitude.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Time Zone (IANA)</Label>
                <Input placeholder="America/New_York" {...form.register("ianaTimeId")} />
                {form.formState.errors.ianaTimeId && (
                  <p className="text-xs text-destructive">{form.formState.errors.ianaTimeId.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>District</Label>
                <Input placeholder="Financial District" {...form.register("district")} />
                {form.formState.errors.district && (
                  <p className="text-xs text-destructive">{form.formState.errors.district.message}</p>
                )}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Location Key</Label>
                <Input placeholder="united-states|miami|financial-district" {...form.register("locationKey")} />
                {form.formState.errors.locationKey && (
                  <p className="text-xs text-destructive">{form.formState.errors.locationKey.message}</p>
                )}
              </div>
            </div>

            {prefillMessage && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                {prefillMessage}
              </div>
            )}
            {prefillError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {prefillError}
              </div>
            )}
            {prefillIsStale && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-400">
                Name or address changed after lookup. Run Google Re-Prefill to refresh Place ID and coordinates.
              </div>
            )}
          </section>

          <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Core</h2>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <FieldLabel label="Type" {...suggestProps("type")} />
                <select
                  value={form.watch("type") || ""}
                  onChange={(event) =>
                    form.setValue("type", event.target.value, {
                      shouldDirty: true,
                      shouldValidate: true,
                      shouldTouch: true,
                    })
                  }
                  disabled={isLoadingTypes}
                  className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground"
                >
                  <option value="">
                    {isLoadingTypes ? "Loading types..." : "Select a type"}
                  </option>
                  {locationTypes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {form.formState.errors.type && (
                  <p className="text-xs text-destructive">{form.formState.errors.type.message}</p>
                )}
              </div>
              <OptionSelect
                label="Price"
                options={PRICE_OPTIONS}
                value={form.watch("price")}
                onChange={(value) =>
                  form.setValue("price", value as AddAccommodationsFormData["price"], { shouldValidate: true })
                }
                error={form.formState.errors.price?.message}
                {...suggestProps("price")}
              />
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">The Stay</h2>
            <MultiOptionTable
              label="Perfect For"
              options={PERFECT_FOR_OPTIONS}
              values={form.watch("perfectFor")}
              onToggle={(value) => toggleMultiOption("perfectFor", value)}
              error={form.formState.errors.perfectFor?.message}
              {...suggestProps("perfectFor")}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OptionSelect
                label="Kid Friendly"
                options={BOOLEAN_OPTIONS}
                value={form.watch("kidFriendly")}
                onChange={(value) =>
                  form.setValue("kidFriendly", value as AddAccommodationsFormData["kidFriendly"], { shouldValidate: true })
                }
                error={form.formState.errors.kidFriendly?.message}
                {...suggestProps("kidFriendly")}
              />
              <OptionSelect
                label="AC"
                options={BOOLEAN_OPTIONS}
                value={form.watch("ac")}
                onChange={(value) =>
                  form.setValue("ac", value as AddAccommodationsFormData["ac"], { shouldValidate: true })
                }
                error={form.formState.errors.ac?.message}
                {...suggestProps("ac")}
              />
              <OptionSelect
                label="WiFi"
                options={BOOLEAN_OPTIONS}
                value={form.watch("wifi")}
                onChange={(value) =>
                  form.setValue("wifi", value as AddAccommodationsFormData["wifi"], { shouldValidate: true })
                }
                error={form.formState.errors.wifi?.message}
                {...suggestProps("wifi")}
              />
              <OptionSelect
                label="Extra Guest Fee"
                options={BOOLEAN_OPTIONS}
                value={form.watch("extraGuestFee")}
                onChange={(value) =>
                  form.setValue("extraGuestFee", value as AddAccommodationsFormData["extraGuestFee"], { shouldValidate: true })
                }
                error={form.formState.errors.extraGuestFee?.message}
                {...suggestProps("extraGuestFee")}
              />
            </div>
            <MultiOptionTable
              label="Parking"
              options={PARKING_OPTIONS}
              values={form.watch("parking")}
              onToggle={(value) => toggleMultiOption("parking", value)}
              error={form.formState.errors.parking?.message}
              {...suggestProps("parking")}
            />
            <OptionSelect
              label="Breakfast Served"
              options={BOOLEAN_OPTIONS}
              value={form.watch("breakfastServed")}
              onChange={(value) =>
                form.setValue("breakfastServed", value as AddAccommodationsFormData["breakfastServed"], { shouldValidate: true })
              }
              error={form.formState.errors.breakfastServed?.message}
              {...suggestProps("breakfastServed")}
            />
          </section>

          <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">The Experience</h2>
            <MultiOptionTable
              label="Vibe"
              options={VIBE_OPTIONS}
              values={form.watch("vibe")}
              onToggle={(value) => toggleMultiOption("vibe", value)}
              error={form.formState.errors.vibe?.message}
              {...suggestProps("vibe")}
            />
            <MultiOptionTable
              label="Workspace"
              options={WORKSPACE_OPTIONS}
              values={form.watch("workspace")}
              onToggle={(value) => toggleMultiOption("workspace", value)}
              error={form.formState.errors.workspace?.message}
              {...suggestProps("workspace")}
            />
            <OptionSelect
              label="Restaurant"
              options={BOOLEAN_OPTIONS}
              value={form.watch("restaurant")}
              onChange={(value) =>
                form.setValue("restaurant", value as AddAccommodationsFormData["restaurant"], { shouldValidate: true })
              }
              error={form.formState.errors.restaurant?.message}
              {...suggestProps("restaurant")}
            />
            <MultiOptionTable
              label="Pool"
              options={POOL_OPTIONS}
              values={form.watch("pool")}
              onToggle={(value) => toggleMultiOption("pool", value)}
              error={form.formState.errors.pool?.message}
              {...suggestProps("pool")}
            />
            <OptionSelect
              label="Rooftop Lounge"
              options={BOOLEAN_OPTIONS}
              value={form.watch("rooftopLounge")}
              onChange={(value) =>
                form.setValue("rooftopLounge", value as AddAccommodationsFormData["rooftopLounge"], { shouldValidate: true })
              }
              error={form.formState.errors.rooftopLounge?.message}
              {...suggestProps("rooftopLounge")}
            />
            <MultiOptionTable
              label="Jacuzzi"
              options={JACUZZI_OPTIONS}
              values={form.watch("jacuzzi")}
              onToggle={(value) => toggleMultiOption("jacuzzi", value)}
              error={form.formState.errors.jacuzzi?.message}
              {...suggestProps("jacuzzi")}
            />
            <OptionSelect
              label="Gym"
              options={GYM_OPTIONS}
              value={form.watch("gym")}
              onChange={(value) =>
                form.setValue("gym", value as AddAccommodationsFormData["gym"], { shouldValidate: true })
              }
              error={form.formState.errors.gym?.message}
              {...suggestProps("gym")}
            />
          </section>

          <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">The Details</h2>
            <OptionSelect
              label="Walkability"
              options={WALKABILITY_OPTIONS}
              value={form.watch("walkability")}
              onChange={(value) =>
                form.setValue("walkability", value as AddAccommodationsFormData["walkability"], { shouldValidate: true })
              }
              error={form.formState.errors.walkability?.message}
              {...suggestProps("walkability")}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <FieldLabel label="Check-In Time" {...suggestProps("checkInTime")} />
                <Input type="time" {...form.register("checkInTime")} />
                {form.formState.errors.checkInTime && (
                  <p className="text-xs text-destructive">{form.formState.errors.checkInTime.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <FieldLabel label="Check-Out Time" {...suggestProps("checkOutTime")} />
                <Input type="time" {...form.register("checkOutTime")} />
                {form.formState.errors.checkOutTime && (
                  <p className="text-xs text-destructive">{form.formState.errors.checkOutTime.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input placeholder="+1 (555) 700-1200" {...form.register("phone")} />
                {form.formState.errors.phone && (
                  <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Website URL</Label>
                <Input placeholder="https://example.com/hotel" {...form.register("websiteUrl")} />
                {form.formState.errors.websiteUrl && (
                  <p className="text-xs text-destructive">{form.formState.errors.websiteUrl.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Booking URL</Label>
                <Input placeholder="https://example.com/hotel/book" {...form.register("bookingUrl")} />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleBookingUrlSuggest()}
                    disabled={bookingSuggestState.status === "busy"}
                  >
                    {bookingSuggestState.status === "busy" ? "Suggesting..." : "Suggest with AI"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Lands as a Pending Suggestion; accept to apply.
                  </span>
                </div>
                {form.formState.errors.bookingUrl && (
                  <p className="text-xs text-destructive">{form.formState.errors.bookingUrl.message}</p>
                )}
                {bookingSuggestState.status === "error" && (
                  <p className="text-xs text-destructive">{bookingSuggestState.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Google Maps URL</Label>
                <Input placeholder="https://maps.google.com/..." {...form.register("googleMapsUrl")} />
                {form.formState.errors.googleMapsUrl && (
                  <p className="text-xs text-destructive">{form.formState.errors.googleMapsUrl.message}</p>
                )}
              </div>
            </div>
          </section>

          <div className="space-y-2 mt-6">
            <Button
              type="submit"
              disabled={isPending || !form.formState.isValid || (!form.formState.isDirty && !needsTitleBackfill)}
              className="w-full h-10 text-sm font-normal bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isPending ? "Updating..." : "Update Accommodations"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/")}
              className="w-full h-10"
            >
              Cancel
            </Button>
          </div>

          {updateError && (
            <ErrorAlert message={updateError.message} />
          )}
        </form>
      </div>

      <SuggestionStackOverlay
        stack={suggestionStack}
        locationTypes={locationTypes}
        pendingCount={pendingFields.size}
        onApply={applyStackedSuggestion}
        onDismiss={dismissStackedSuggestion}
      />
    </div>
  );
}
