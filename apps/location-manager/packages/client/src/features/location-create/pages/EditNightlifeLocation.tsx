import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Clock, Music2 } from "lucide-react";
import { z } from "zod";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Button } from "@client/components/ui/button";
import { Breadcrumbs } from "@client/shared/components/layout";
import { ErrorAlert } from "@client/shared/components/ui";
import {
  locationsApi,
  useLocationById,
  useUpdateLocation,
  type LocationResponse,
} from "@client/shared/services/api";
import type { LocationCategory } from "@shared/types/location-category";
import { addNightlifeSchema } from "../validation/add-nightlife.schema";
import { OperationHoursModal } from "../components/OperationHoursModal";
import { buildOperationHoursSummary, isOperationHoursJson } from "../components/operation-hours-utils";
import {
  CLUB_TYPE_OPTIONS,
  CLUB_TYPE_VALUES,
  CROWD_PROFILE_OPTIONS,
  CROWD_PROFILE_VALUES,
  DAYTIME_RESTAURANT_OPTIONS,
  DAYTIME_RESTAURANT_VALUES,
  DRESS_CODE_OPTIONS,
  DRESS_CODE_VALUES,
  ENERGY_LEVEL_OPTIONS,
  ENERGY_LEVEL_VALUES,
  MUSIC_FORMAT_OPTIONS,
  MUSIC_FORMAT_VALUES,
  MUSIC_OPTIONS,
  MUSIC_VALUES,
  PEAK_HOURS_OPTIONS,
  PEAK_HOURS_VALUES,
  PRICE_TIER_OPTIONS,
  PRICE_TIER_VALUES,
  SPACE_LAYOUT_OPTIONS,
  SPACE_LAYOUT_VALUES,
  TOURIST_PRESENCE_OPTIONS,
  TOURIST_PRESENCE_VALUES,
  type NightlifeOption,
  VENUE_SIZE_OPTIONS,
  VENUE_SIZE_VALUES,
  VENUE_TYPE_OPTIONS,
  VENUE_TYPE_VALUES,
  VIP_BOTTLE_SERVICE_OPTIONS,
  VIP_BOTTLE_SERVICE_VALUES,
  VIBE_OPTIONS,
  VIBE_VALUES,
} from "../constants/nightlife-options";

const editNightlifeSchema = addNightlifeSchema.extend({
  countryCode: z
    .string()
    .trim()
    .length(2, "Country code must be 2 letters")
    .transform((value) => value.toUpperCase()),
});

type EditNightlifeFormData = z.infer<typeof editNightlifeSchema>;
type MultiField = "music" | "spaceLayout" | "vibe" | "musicFormat" | "dressCode";

type UnknownRecord = Record<string, unknown>;

interface OptionTableProps {
  label: string;
  options: NightlifeOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

interface MultiOptionTableProps {
  label: string;
  options: NightlifeOption[];
  values: string[];
  onToggle: (value: string) => void;
  error?: string;
}

interface ParsedNightlifeDetails {
  name: string | null;
  priceTier: string | null;
  clubType: string | null;
  music: string[];
  venueType: string | null;
  venueSize: string | null;
  spaceLayout: string[];
  vibe: string[];
  peakHours: string | null;
  touristPresence: string | null;
  musicFormat: string[];
  dressCode: string[];
  energyLevel: string | null;
  vipAndBottleService: string | null;
  crowdProfile: string | null;
  location: string | null;
  phone: string | null;
  hours: string | null;
  website: string | null;
  reserveUrl: string | null;
  daytimeRestaurant: string | null;
}

const COUNTRY_OPTIONS = [
  { value: "PE", label: "Peru (PE)" },
  { value: "CO", label: "Colombia (CO)" },
  { value: "BR", label: "Brazil (BR)" },
];

const NIGHTLIFE_FORM_DEFAULT_VALUES: EditNightlifeFormData = {
  name: "",
  priceTier: "$$$",
  clubType: "Night Club",
  music: ["House", "EDM"],
  venueType: "Nightclub",
  venueSize: "Large",
  spaceLayout: ["Indoor", "Rooftop"],
  vibe: ["Upscale", "Exclusive", "High-Energy"],
  peakHours: "1:00 AM - 3:30 AM",
  touristPresence: "Low",
  musicFormat: ["Open Format"],
  dressCode: ["Upscale", "Dress to Impress"],
  energyLevel: "High",
  vipAndBottleService: "Yes",
  crowdProfile: "20-40",
  countryCode: "PE",
  location: "",
  phone: "",
  hours: "",
  website: "",
  reserveUrl: "",
  district: "",
  locationKey: "",
  ianaTimeId: "",
  placeId: "",
  googleUrl: "",
  latitude: "",
  longitude: "",
  daytimeRestaurant: "0",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

function normalizeAddress(address: string) {
  return address.trim();
}

function buildPrefillSignature(name: string, address: string) {
  return `${name.trim().toLowerCase()}|${normalizeAddress(address).toLowerCase()}`;
}

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => asString(item))
      .filter((item): item is string => Boolean(item));
  }

  const single = asString(value);
  return single ? [single] : [];
}

function getNestedValue(record: UnknownRecord | null, path: string[]): unknown {
  if (!record) return undefined;

  let current: unknown = record;
  for (const key of path) {
    const nextRecord = asRecord(current);
    if (!nextRecord) return undefined;
    current = nextRecord[key];
  }

  return current;
}

function getSectionValue(
  details: UnknownRecord | null,
  section: "theSpace" | "theScene",
  key: string
): unknown {
  const raw = getNestedValue(details, ["details", section, key]);
  const rawRecord = asRecord(raw);
  if (rawRecord && "value" in rawRecord) {
    return rawRecord.value;
  }
  return raw;
}

function parseNightlifeDetails(details: unknown): ParsedNightlifeDetails {
  const root = asRecord(details);
  const touristPresenceValue =
    getSectionValue(root, "theScene", "touristPresence") ??
    getSectionValue(root, "theSpace", "touristPresence");

  return {
    name: asString(getNestedValue(root, ["name"])),
    priceTier: asString(getNestedValue(root, ["price_tier"])),
    clubType: asString(getNestedValue(root, ["club_type"])),
    music: asStringArray(getNestedValue(root, ["music"])),
    venueType: asString(getSectionValue(root, "theSpace", "venueType")),
    venueSize: asString(getSectionValue(root, "theSpace", "venueSize")),
    spaceLayout: asStringArray(getSectionValue(root, "theSpace", "spaceLayout")),
    vibe: asStringArray(getSectionValue(root, "theSpace", "vibe")),
    peakHours: asString(getSectionValue(root, "theSpace", "peakHours")),
    touristPresence: asString(touristPresenceValue),
    musicFormat: asStringArray(getSectionValue(root, "theScene", "musicFormat")),
    dressCode: asStringArray(getSectionValue(root, "theScene", "dressCode")),
    energyLevel: asString(getSectionValue(root, "theScene", "energyLevel")),
    vipAndBottleService: asString(getSectionValue(root, "theScene", "vipAndBottleService")),
    crowdProfile: asString(getSectionValue(root, "theScene", "crowdProfile")),
    location: asString(getNestedValue(root, ["location"])),
    phone: asString(getNestedValue(root, ["phone"])),
    hours: asString(getNestedValue(root, ["hours"])),
    website: asString(getNestedValue(root, ["website"])),
    reserveUrl: asString(getNestedValue(root, ["reserve_url"])),
    daytimeRestaurant: asString(getNestedValue(root, ["daytime_restaurant"])),
  };
}

function pickSingleOption<T extends readonly string[]>(
  value: string | null | undefined,
  options: T,
  fallback: T[number]
): T[number] {
  if (value && options.includes(value as T[number])) {
    return value as T[number];
  }
  return fallback;
}

function pickMultiOptions<T extends readonly string[]>(
  values: string[] | null | undefined,
  options: T,
  fallback: readonly T[number][]
): T[number][] {
  if (!values || values.length === 0) return [...fallback] as T[number][];
  const optionSet = new Set<string>(options);
  const validValues = values.filter((value): value is T[number] => optionSet.has(value));
  if (validValues.length === 0) return [...fallback] as T[number][];
  return validValues;
}

function normalizeCountryCode(value: string | null | undefined): string {
  if (!value) return NIGHTLIFE_FORM_DEFAULT_VALUES.countryCode;
  const normalized = value.trim().toUpperCase();
  if (normalized.length === 2) return normalized;
  return NIGHTLIFE_FORM_DEFAULT_VALUES.countryCode;
}

function mapLocationToNightlifeFormValues(location: LocationResponse): EditNightlifeFormData {
  const details = parseNightlifeDetails(location.nightlifeDetails);

  return {
    ...NIGHTLIFE_FORM_DEFAULT_VALUES,
    name: location.source.name || details.name || NIGHTLIFE_FORM_DEFAULT_VALUES.name,
    priceTier: pickSingleOption(
      details.priceTier ?? location.priceLevel,
      PRICE_TIER_VALUES,
      NIGHTLIFE_FORM_DEFAULT_VALUES.priceTier
    ),
    clubType: pickSingleOption(
      details.clubType ?? location.type,
      CLUB_TYPE_VALUES,
      NIGHTLIFE_FORM_DEFAULT_VALUES.clubType
    ),
    music: pickMultiOptions(details.music, MUSIC_VALUES, NIGHTLIFE_FORM_DEFAULT_VALUES.music),
    venueType: pickSingleOption(
      details.venueType,
      VENUE_TYPE_VALUES,
      NIGHTLIFE_FORM_DEFAULT_VALUES.venueType
    ),
    venueSize: pickSingleOption(
      details.venueSize,
      VENUE_SIZE_VALUES,
      NIGHTLIFE_FORM_DEFAULT_VALUES.venueSize
    ),
    spaceLayout: pickMultiOptions(
      details.spaceLayout,
      SPACE_LAYOUT_VALUES,
      NIGHTLIFE_FORM_DEFAULT_VALUES.spaceLayout
    ),
    vibe: pickMultiOptions(details.vibe, VIBE_VALUES, NIGHTLIFE_FORM_DEFAULT_VALUES.vibe),
    peakHours: pickSingleOption(
      details.peakHours,
      PEAK_HOURS_VALUES,
      NIGHTLIFE_FORM_DEFAULT_VALUES.peakHours
    ),
    touristPresence: pickSingleOption(
      details.touristPresence,
      TOURIST_PRESENCE_VALUES,
      NIGHTLIFE_FORM_DEFAULT_VALUES.touristPresence
    ),
    musicFormat: pickMultiOptions(
      details.musicFormat,
      MUSIC_FORMAT_VALUES,
      NIGHTLIFE_FORM_DEFAULT_VALUES.musicFormat
    ),
    dressCode: pickMultiOptions(
      details.dressCode,
      DRESS_CODE_VALUES,
      NIGHTLIFE_FORM_DEFAULT_VALUES.dressCode
    ),
    energyLevel: pickSingleOption(
      details.energyLevel,
      ENERGY_LEVEL_VALUES,
      NIGHTLIFE_FORM_DEFAULT_VALUES.energyLevel
    ),
    vipAndBottleService: pickSingleOption(
      details.vipAndBottleService,
      VIP_BOTTLE_SERVICE_VALUES,
      NIGHTLIFE_FORM_DEFAULT_VALUES.vipAndBottleService
    ),
    crowdProfile: pickSingleOption(
      details.crowdProfile,
      CROWD_PROFILE_VALUES,
      NIGHTLIFE_FORM_DEFAULT_VALUES.crowdProfile
    ),
    countryCode: normalizeCountryCode(location.contact.countryCode),
    location: location.source.address || details.location || NIGHTLIFE_FORM_DEFAULT_VALUES.location,
    phone: location.contact.phoneNumber || details.phone || "",
    hours: location.operationHours
      ? JSON.stringify(location.operationHours, null, 2)
      : details.hours || "",
    website: location.contact.website || details.website || "",
    reserveUrl: details.reserveUrl || "",
    district: location.district || "",
    locationKey: location.locationKey || "",
    ianaTimeId: location.ianaTimeId || "",
    placeId: location.placeId || "",
    googleUrl: location.contact.url || "",
    latitude: location.coordinates.lat != null ? String(location.coordinates.lat) : "",
    longitude: location.coordinates.lng != null ? String(location.coordinates.lng) : "",
    daytimeRestaurant: pickSingleOption(
      details.daytimeRestaurant,
      DAYTIME_RESTAURANT_VALUES,
      NIGHTLIFE_FORM_DEFAULT_VALUES.daytimeRestaurant
    ),
  };
}

function OptionSelect({ label, options, value, onChange, error }: OptionTableProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground"
      >
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
              <th className="text-left px-2 py-1.5 font-medium">Option</th>
              <th className="text-left px-2 py-1.5 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {options.map((option) => (
              <tr
                key={option.value}
                className={value === option.value ? "bg-primary/10" : "border-t border-border"}
              >
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

function MultiOptionTable({ label, options, values, onToggle, error }: MultiOptionTableProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
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
                <tr
                  key={option.value}
                  className={
                    isChecked ? "bg-primary/10 border-t border-border" : "border-t border-border"
                  }
                >
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

export function EditNightlifeLocation() {
  const navigate = useNavigate();
  const { id, category } = useParams<{ id: string; category: LocationCategory }>();

  const parsedId = id ? Number.parseInt(id, 10) : Number.NaN;
  const locationId = Number.isFinite(parsedId) ? parsedId : null;
  const routeCategory = category === "nightlife" ? "nightlife" : null;

  const [isPrefillingGoogle, setIsPrefillingGoogle] = useState(false);
  const [operationHoursModalOpen, setOperationHoursModalOpen] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillSignature, setPrefillSignature] = useState<string | null>(null);
  const [updatedName, setUpdatedName] = useState<string | null>(null);

  const form = useForm<EditNightlifeFormData>({
    resolver: zodResolver(editNightlifeSchema),
    defaultValues: NIGHTLIFE_FORM_DEFAULT_VALUES,
    mode: "onChange",
  });

  const { data: location, isLoading, error: fetchError } = useLocationById(locationId, routeCategory);
  const { mutate: updateLocation, isPending, error: updateError } = useUpdateLocation();

  useEffect(() => {
    if (!location) return;

    const nextValues = mapLocationToNightlifeFormValues(location);
    form.reset(nextValues);
    setPrefillSignature(buildPrefillSignature(nextValues.name, nextValues.location));
    setPrefillMessage(null);
    setPrefillError(null);
  }, [location, form]);

  const currentPrefillSignature = buildPrefillSignature(form.watch("name"), form.watch("location"));
  const isPrefillReady = prefillSignature !== null && prefillSignature === currentPrefillSignature;
  const prefillIsStale = prefillSignature !== null && !isPrefillReady;

  const selectedCountryCode = form.watch("countryCode");
  const countryOptions = useMemo(() => {
    const normalized = selectedCountryCode.trim().toUpperCase();
    if (!normalized || COUNTRY_OPTIONS.some((option) => option.value === normalized)) {
      return COUNTRY_OPTIONS;
    }

    return [{ value: normalized, label: `${normalized} (Current)` }, ...COUNTRY_OPTIONS];
  }, [selectedCountryCode]);
  const hoursValue = form.watch("hours") ?? "";
  const hasStructuredOperationHours = isOperationHoursJson(hoursValue);
  const hasLegacyTextHours = Boolean(hoursValue.trim()) && !hasStructuredOperationHours;

  const toggleMultiOption = (field: MultiField, value: string) => {
    const currentValues = (form.getValues(field) || []) as string[];
    const nextValues = currentValues.includes(value)
      ? currentValues.filter((item) => item !== value)
      : [...currentValues, value];

    form.setValue(field, nextValues as EditNightlifeFormData[MultiField], {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });
  };

  const handleGooglePrefill = async () => {
    setPrefillError(null);
    setPrefillMessage(null);

    const isStepValid = await form.trigger(["name", "location"]);
    if (!isStepValid) {
      setPrefillSignature(null);
      setPrefillError("Enter a valid name and address before running Google lookup.");
      return;
    }

    const name = form.getValues("name").trim();
    const normalizedAddress = normalizeAddress(form.getValues("location"));

    form.setValue("location", normalizedAddress, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });

    setIsPrefillingGoogle(true);

    try {
      const prefill = await locationsApi.googlePrefill("nightlife", {
        name,
        address: normalizedAddress,
      });

      form.setValue("placeId", prefill.placeId, {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      form.setValue("latitude", String(prefill.lat), {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      form.setValue("longitude", String(prefill.lng), {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      form.setValue("googleUrl", prefill.googleUrl, {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      form.setValue("locationKey", prefill.locationKey || "", {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      form.setValue("district", prefill.district || "", {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      form.setValue("ianaTimeId", prefill.ianaTimeId || "", {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });

      setPrefillSignature(buildPrefillSignature(name, normalizedAddress));
      setPrefillMessage("Google lookup complete. Place ID, location key, district, and time zone were refreshed.");
    } catch (lookupError) {
      setPrefillSignature(null);
      setPrefillError(getErrorMessage(lookupError));
    } finally {
      setIsPrefillingGoogle(false);
    }
  };

  const onSubmit = (data: EditNightlifeFormData) => {
    if (routeCategory !== "nightlife" || locationId === null) {
      setPrefillError("Invalid nightlife edit route.");
      return;
    }

    const normalizedAddress = normalizeAddress(data.location);
    const music = data.music;
    const spaceLayout = data.spaceLayout;
    const vibe = data.vibe;
    const musicFormat = data.musicFormat;
    const dressCode = data.dressCode;
    const operationHoursValue = (data.hours ?? "").trim();
    const hasStructuredHours = isOperationHoursJson(operationHoursValue);
    const nightlifeHours = hasStructuredHours
      ? buildOperationHoursSummary(operationHoursValue)
      : operationHoursValue;

    const nightlifeDetails = {
      name: data.name,
      price_tier: data.priceTier,
      club_type: data.clubType,
      music,
      details: {
        theSpace: {
          venueType: { label: "Venue Type", value: data.venueType },
          venueSize: { label: "Venue Size", value: data.venueSize },
          spaceLayout: { label: "Layout", value: spaceLayout },
          vibe: { label: "Vibe", value: vibe },
          peakHours: { label: "Peak Hours", value: data.peakHours },
        },
        theScene: {
          musicFormat: { label: "Music", value: musicFormat },
          touristPresence: { label: "Tourist Presence", value: data.touristPresence },
          dressCode: { label: "Dress Code", value: dressCode },
          energyLevel: { label: "Energy Level", value: data.energyLevel },
          vipAndBottleService: { label: "VIP & Bottle Service", value: data.vipAndBottleService },
          crowdProfile: { label: "Age Range", value: data.crowdProfile },
        },
      },
      location: normalizedAddress,
      phone: data.phone || "",
      hours: nightlifeHours,
      website: data.website || "",
      reserve_url: data.reserveUrl || "",
      daytime_restaurant: Number(data.daytimeRestaurant),
    };

    updateLocation(
      {
        category: "nightlife",
        id: locationId,
        data: {
          name: data.name,
          title: data.name,
          address: normalizedAddress,
          type: data.clubType,
          priceLevel: data.priceTier,
          countryCode: data.countryCode,
          phoneNumber: data.phone || "",
          website: data.website || "",
          district: data.district || "",
          locationKey: data.locationKey || "",
          ianaTimeId: data.ianaTimeId || "",
          placeId: data.placeId || "",
          operationHours: hasStructuredHours ? operationHoursValue : undefined,
          nightlifeDetails,
        },
      },
      {
        onSuccess: (response) => {
          const nextValues = mapLocationToNightlifeFormValues(response);
          form.reset(nextValues);
          setOperationHoursModalOpen(false);
          setUpdatedName(response.title || response.source.name);
          setPrefillSignature(buildPrefillSignature(nextValues.name, nextValues.location));
          setPrefillMessage("Nightlife document updated successfully.");
          setPrefillError(null);
        },
      }
    );
  };

  if (routeCategory !== "nightlife" || locationId === null) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <Breadcrumbs items={[{ label: "Edit Nightlife" }]} />
        <ErrorAlert
          title="Invalid edit route"
          message="Nightlife edit requires /edit/nightlife/:id"
          onRetry={() => navigate("/")}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <Breadcrumbs items={[{ label: "Edit Nightlife" }]} />
        <div className="bg-card border border-border rounded-xl p-6 text-sm text-muted-foreground">
          Loading nightlife location...
        </div>
      </div>
    );
  }

  if (fetchError || !location) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <Breadcrumbs items={[{ label: "Edit Nightlife" }]} />
        <ErrorAlert
          title="Error loading location"
          message={fetchError?.message || "Nightlife location not found"}
          onRetry={() => navigate("/")}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-6xl bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Music2 className="w-4 h-4 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground underline">Edit Nightlife</h1>
        </div>

        {updatedName && (
          <div className="mb-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
            Updated nightlife document: {updatedName}
          </div>
        )}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <section className="space-y-4">
            <h2 className="text-xs font-semibold tracking-wide text-foreground">Step 1: Name + Address</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input placeholder="Nebula" {...form.register("name")} />
                {form.formState.errors.name && (
                  <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input placeholder="Av. La Mar 1337, Miraflores, Lima" {...form.register("location")} />
                {form.formState.errors.location && (
                  <p className="text-xs text-destructive">{form.formState.errors.location.message}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleGooglePrefill()}
                disabled={isPrefillingGoogle || isPending}
              >
                {isPrefillingGoogle ? "Fetching Google data..." : "Refresh Place ID + Coordinates"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Optional. Use lookup after changing name or address.
              </p>
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
                Name or address changed after lookup. Run Google lookup again to refresh Place ID and
                coordinates.
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-semibold tracking-wide text-foreground">Entities Table</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Google URL</Label>
                <Input placeholder="https://www.google.com/maps/..." {...form.register("googleUrl")} disabled />
                <p className="text-xs text-muted-foreground">Reference-only in edit mode.</p>
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
                <Input placeholder="-12.0464" {...form.register("latitude")} disabled />
                <p className="text-xs text-muted-foreground">Coordinates are locked on edit.</p>
              </div>
              <div className="space-y-2">
                <Label>Longitude</Label>
                <Input placeholder="-77.0428" {...form.register("longitude")} disabled />
              </div>
              <div className="space-y-2">
                <Label>Time Zone (IANA)</Label>
                <Input placeholder="America/Lima" {...form.register("ianaTimeId")} />
                {form.formState.errors.ianaTimeId && (
                  <p className="text-xs text-destructive">{form.formState.errors.ianaTimeId.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>District</Label>
                <Input placeholder="Miraflores" {...form.register("district")} />
                {form.formState.errors.district && (
                  <p className="text-xs text-destructive">{form.formState.errors.district.message}</p>
                )}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Location Key</Label>
                <Input placeholder="peru|lima|miraflores" {...form.register("locationKey")} />
                {form.formState.errors.locationKey && (
                  <p className="text-xs text-destructive">{form.formState.errors.locationKey.message}</p>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-semibold tracking-wide text-foreground">Core</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OptionSelect
                label="Club Type"
                options={CLUB_TYPE_OPTIONS}
                value={form.watch("clubType")}
                onChange={(value) =>
                  form.setValue("clubType", value as EditNightlifeFormData["clubType"], {
                    shouldValidate: true,
                    shouldDirty: true,
                    shouldTouch: true,
                  })
                }
                error={form.formState.errors.clubType?.message}
              />
            </div>

            <MultiOptionTable
              label="Music"
              options={MUSIC_OPTIONS}
              values={form.watch("music")}
              onToggle={(value) => toggleMultiOption("music", value)}
              error={form.formState.errors.music?.message as string | undefined}
            />
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-semibold tracking-wide text-foreground">The Space</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OptionSelect
                label="Price Tier"
                options={PRICE_TIER_OPTIONS}
                value={form.watch("priceTier")}
                onChange={(value) =>
                  form.setValue("priceTier", value as EditNightlifeFormData["priceTier"], {
                    shouldValidate: true,
                    shouldDirty: true,
                    shouldTouch: true,
                  })
                }
                error={form.formState.errors.priceTier?.message}
              />
              <OptionSelect
                label="Venue Type"
                options={VENUE_TYPE_OPTIONS}
                value={form.watch("venueType")}
                onChange={(value) =>
                  form.setValue("venueType", value as EditNightlifeFormData["venueType"], {
                    shouldValidate: true,
                    shouldDirty: true,
                    shouldTouch: true,
                  })
                }
                error={form.formState.errors.venueType?.message}
              />
              <OptionSelect
                label="Venue Size"
                options={VENUE_SIZE_OPTIONS}
                value={form.watch("venueSize")}
                onChange={(value) =>
                  form.setValue("venueSize", value as EditNightlifeFormData["venueSize"], {
                    shouldValidate: true,
                    shouldDirty: true,
                    shouldTouch: true,
                  })
                }
                error={form.formState.errors.venueSize?.message}
              />
            </div>

            <MultiOptionTable
              label="Layout"
              options={SPACE_LAYOUT_OPTIONS}
              values={form.watch("spaceLayout")}
              onToggle={(value) => toggleMultiOption("spaceLayout", value)}
              error={form.formState.errors.spaceLayout?.message as string | undefined}
            />

            <MultiOptionTable
              label="Vibe"
              options={VIBE_OPTIONS}
              values={form.watch("vibe")}
              onToggle={(value) => toggleMultiOption("vibe", value)}
              error={form.formState.errors.vibe?.message as string | undefined}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OptionSelect
                label="Peak Hours"
                options={PEAK_HOURS_OPTIONS}
                value={form.watch("peakHours")}
                onChange={(value) =>
                  form.setValue("peakHours", value as EditNightlifeFormData["peakHours"], {
                    shouldValidate: true,
                    shouldDirty: true,
                    shouldTouch: true,
                  })
                }
                error={form.formState.errors.peakHours?.message}
              />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-semibold tracking-wide text-foreground">The Scene</h2>
            <MultiOptionTable
              label="Music Format"
              options={MUSIC_FORMAT_OPTIONS}
              values={form.watch("musicFormat")}
              onToggle={(value) => toggleMultiOption("musicFormat", value)}
              error={form.formState.errors.musicFormat?.message as string | undefined}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OptionSelect
                label="Tourist Presence"
                options={TOURIST_PRESENCE_OPTIONS}
                value={form.watch("touristPresence")}
                onChange={(value) =>
                  form.setValue("touristPresence", value as EditNightlifeFormData["touristPresence"], {
                    shouldValidate: true,
                    shouldDirty: true,
                    shouldTouch: true,
                  })
                }
                error={form.formState.errors.touristPresence?.message}
              />
              <OptionSelect
                label="Energy Level"
                options={ENERGY_LEVEL_OPTIONS}
                value={form.watch("energyLevel")}
                onChange={(value) =>
                  form.setValue("energyLevel", value as EditNightlifeFormData["energyLevel"], {
                    shouldValidate: true,
                    shouldDirty: true,
                    shouldTouch: true,
                  })
                }
                error={form.formState.errors.energyLevel?.message}
              />
              <OptionSelect
                label="VIP & Bottle Service"
                options={VIP_BOTTLE_SERVICE_OPTIONS}
                value={form.watch("vipAndBottleService")}
                onChange={(value) =>
                  form.setValue(
                    "vipAndBottleService",
                    value as EditNightlifeFormData["vipAndBottleService"],
                    {
                      shouldValidate: true,
                      shouldDirty: true,
                      shouldTouch: true,
                    }
                  )
                }
                error={form.formState.errors.vipAndBottleService?.message}
              />
              <OptionSelect
                label="Crowd Profile (Age Range)"
                options={CROWD_PROFILE_OPTIONS}
                value={form.watch("crowdProfile")}
                onChange={(value) =>
                  form.setValue("crowdProfile", value as EditNightlifeFormData["crowdProfile"], {
                    shouldValidate: true,
                    shouldDirty: true,
                    shouldTouch: true,
                  })
                }
                error={form.formState.errors.crowdProfile?.message}
              />
            </div>

            <MultiOptionTable
              label="Dress Code"
              options={DRESS_CODE_OPTIONS}
              values={form.watch("dressCode")}
              onToggle={(value) => toggleMultiOption("dressCode", value)}
              error={form.formState.errors.dressCode?.message as string | undefined}
            />
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-semibold tracking-wide text-foreground">Contact & Access</h2>
            <div className="space-y-2 max-w-xs">
              <Label>Country</Label>
              <select
                value={selectedCountryCode}
                onChange={(event) => {
                  form.setValue("countryCode", event.target.value.toUpperCase(), {
                    shouldValidate: true,
                    shouldDirty: true,
                    shouldTouch: true,
                  });
                }}
                className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground"
              >
                {countryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input placeholder="+1 (555) 234-5678" {...form.register("phone")} />
              </div>
              <div className="space-y-2">
                <Label>Hours</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setOperationHoursModalOpen(true)}
                  >
                    <Clock className="h-4 w-4" />
                    {hoursValue ? "Edit schedule" : "Set schedule"}
                  </Button>
                  {hoursValue && !hasLegacyTextHours && (
                    <span className="text-xs text-muted-foreground">
                      Schedule configured - open modal to edit
                    </span>
                  )}
                </div>
                {hasLegacyTextHours && (
                  <p className="text-xs text-amber-500">
                    Legacy free-text hours detected. Open the schedule modal and save to convert it to the
                    restaurant-style format.
                  </p>
                )}
                {operationHoursModalOpen && (
                  <OperationHoursModal
                    open={operationHoursModalOpen}
                    onOpenChange={setOperationHoursModalOpen}
                    value={hoursValue}
                    onSave={(json) => {
                      form.setValue("hours", json, {
                        shouldDirty: true,
                        shouldValidate: true,
                        shouldTouch: true,
                      });
                    }}
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input placeholder="https://example.com/nebula" {...form.register("website")} />
                {form.formState.errors.website && (
                  <p className="text-xs text-destructive">{form.formState.errors.website.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Reserve URL</Label>
                <Input placeholder="https://example.com/nebula/reserve" {...form.register("reserveUrl")} />
                {form.formState.errors.reserveUrl && (
                  <p className="text-xs text-destructive">{form.formState.errors.reserveUrl.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Daytime Restaurant (0 or 1)</Label>
              <select
                value={form.watch("daytimeRestaurant")}
                onChange={(event) =>
                  form.setValue(
                    "daytimeRestaurant",
                    event.target.value as EditNightlifeFormData["daytimeRestaurant"],
                    {
                      shouldValidate: true,
                      shouldDirty: true,
                      shouldTouch: true,
                    }
                  )
                }
                className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground"
              >
                {DAYTIME_RESTAURANT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium">Option</th>
                      <th className="text-left px-2 py-1.5 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DAYTIME_RESTAURANT_OPTIONS.map((option) => (
                      <tr
                        key={option.value}
                        className={
                          form.watch("daytimeRestaurant") === option.value
                            ? "bg-primary/10 border-t border-border"
                            : "border-t border-border"
                        }
                      >
                        <td className="px-2 py-1.5 font-medium">{option.label}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{option.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {form.formState.errors.daytimeRestaurant && (
                <p className="text-xs text-destructive">{form.formState.errors.daytimeRestaurant.message}</p>
              )}
            </div>
          </section>

          {updateError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Error: {updateError.message}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="button" variant="outline" asChild>
              <Link to="/">Back</Link>
            </Button>
            <Button
              type="submit"
              disabled={!form.formState.isDirty || !form.formState.isValid || isPending}
            >
              {isPending ? "Saving..." : "Save Nightlife Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
