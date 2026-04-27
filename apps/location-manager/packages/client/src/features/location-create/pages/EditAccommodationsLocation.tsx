import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BedDouble, ChevronLeft, RefreshCw } from "lucide-react";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Button } from "@client/components/ui/button";
import { Breadcrumbs } from "@client/shared/components/layout";
import { ErrorAlert } from "@client/shared/components/ui";
import { locationsApi, useLocationById, useUpdateLocation } from "@client/shared/services/api";
import { useLocationTypes } from "@client/shared/services/api/hooks/useLocationTypes";
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
  BOOLEAN_OPTIONS,
  GYM_OPTIONS,
  JACUZZI_OPTIONS,
  PARKING_OPTIONS,
  PERFECT_FOR_OPTIONS,
  POOL_OPTIONS,
  PRICE_OPTIONS,
  type AccommodationsOption,
  VIBE_OPTIONS,
  WALKABILITY_OPTIONS,
  WORKSPACE_OPTIONS,
} from "../constants/accommodations-options";

type MultiField = "perfectFor" | "parking" | "vibe" | "workspace" | "pool" | "jacuzzi";

interface OptionSelectProps {
  label: string;
  options: AccommodationsOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

interface MultiOptionTableProps {
  label: string;
  options: AccommodationsOption[];
  values: string[];
  onToggle: (value: string) => void;
  error?: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

function booleanToYesNo(value: boolean | null | undefined, fallback: "yes" | "no" = "yes"): "yes" | "no" {
  if (value === true) return "yes";
  if (value === false) return "no";
  return fallback;
}

function toBoolean(value: "yes" | "no"): boolean {
  return value === "yes";
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

function OptionSelect({ label, options, value, onChange, error }: OptionSelectProps) {
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

const DEFAULT_FORM_VALUES: AddAccommodationsFormData = {
  name: "",
  title: "",
  address: "",
  type: "",
  price: "$$$",
  perfectFor: ["Solo"],
  kidFriendly: "yes",
  ac: "yes",
  wifi: "yes",
  extraGuestFee: "no",
  parking: ["onsite"],
  breakfastServed: "yes",
  vibe: ["Luxury"],
  workspace: ["Dedicated Desk"],
  restaurant: "yes",
  pool: ["outdoor"],
  rooftopLounge: "no",
  jacuzzi: ["shared"],
  gym: "Basic",
  walkability: "Walkable Downtown",
  checkInTime: "15:00",
  checkOutTime: "11:00",
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
};

export function EditAccommodationsLocation() {
  const { id, category } = useParams<{ id: string; category: LocationCategory }>();
  const navigate = useNavigate();
  const locationId = id ? Number.parseInt(id, 10) : null;

  const [isPrefillingGoogle, setIsPrefillingGoogle] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillSignature, setPrefillSignature] = useState<string | null>(null);

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

    const values: AddAccommodationsFormData = {
      name: location.source.name || details.coreName || DEFAULT_FORM_VALUES.name,
      title:
        location.title?.trim() ||
        location.source.name ||
        details.coreName ||
        DEFAULT_FORM_VALUES.title,
      address: location.source.address || details.address || DEFAULT_FORM_VALUES.address,
      type: location.type || details.coreType || "",
      price: pickSingleOption(details.corePrice || location.priceLevel || null, ["$", "$$", "$$$", "$$$$"] as const, DEFAULT_FORM_VALUES.price),
      perfectFor: pickMultiOptions(details.perfectFor, ["Solo", "Couples", "Groups"] as const, DEFAULT_FORM_VALUES.perfectFor),
      kidFriendly: booleanToYesNo(details.kidFriendly, "yes"),
      ac: booleanToYesNo(details.ac, "yes"),
      wifi: booleanToYesNo(details.wifi, "yes"),
      extraGuestFee: booleanToYesNo(details.extraGuestFee, "no"),
      parking: pickMultiOptions(details.parking, ["none", "onsite", "valet", "street", "garage"] as const, DEFAULT_FORM_VALUES.parking),
      breakfastServed: booleanToYesNo(details.breakfastServed, "yes"),
      vibe: pickMultiOptions(
        details.vibe,
        ["Luxury", "Social", "Quiet", "Boutique", "Family-Friendly", "Business-Friendly"] as const,
        DEFAULT_FORM_VALUES.vibe
      ),
      workspace: pickMultiOptions(
        details.workspace,
        ["None", "Shared Lounge", "Dedicated Desk", "Co-working Space"] as const,
        DEFAULT_FORM_VALUES.workspace
      ),
      restaurant: booleanToYesNo(details.restaurant, "yes"),
      pool: pickMultiOptions(details.pool, ["none", "indoor", "outdoor", "rooftop", "infinity"] as const, DEFAULT_FORM_VALUES.pool),
      rooftopLounge: booleanToYesNo(details.rooftopLounge, "no"),
      jacuzzi: pickMultiOptions(details.jacuzzi, ["private", "shared", "rooftop"] as const, DEFAULT_FORM_VALUES.jacuzzi),
      gym: pickSingleOption(details.gym, ["None", "Basic", "Full", "24/7"] as const, DEFAULT_FORM_VALUES.gym),
      walkability: pickSingleOption(
        details.walkability,
        ["Walkable Downtown", "Transit-Friendly", "Car Needed", "Secluded"] as const,
        DEFAULT_FORM_VALUES.walkability
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
    };

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

  const handleSubmit = (data: AddAccommodationsFormData) => {
    if (!locationId) return;

    const normalizedAddress = normalizeAccommodationsAddress(data.address);

    const accommodationsDetails = buildAccommodationsDetails({
      name: data.name,
      price: data.price,
      district: data.district || "",
      type: data.type || "",
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
          type: data.type || undefined,
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

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
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
                <Label>Type</Label>
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
              />
              <OptionSelect
                label="AC"
                options={BOOLEAN_OPTIONS}
                value={form.watch("ac")}
                onChange={(value) =>
                  form.setValue("ac", value as AddAccommodationsFormData["ac"], { shouldValidate: true })
                }
                error={form.formState.errors.ac?.message}
              />
              <OptionSelect
                label="WiFi"
                options={BOOLEAN_OPTIONS}
                value={form.watch("wifi")}
                onChange={(value) =>
                  form.setValue("wifi", value as AddAccommodationsFormData["wifi"], { shouldValidate: true })
                }
                error={form.formState.errors.wifi?.message}
              />
              <OptionSelect
                label="Extra Guest Fee"
                options={BOOLEAN_OPTIONS}
                value={form.watch("extraGuestFee")}
                onChange={(value) =>
                  form.setValue("extraGuestFee", value as AddAccommodationsFormData["extraGuestFee"], { shouldValidate: true })
                }
                error={form.formState.errors.extraGuestFee?.message}
              />
            </div>
            <MultiOptionTable
              label="Parking"
              options={PARKING_OPTIONS}
              values={form.watch("parking")}
              onToggle={(value) => toggleMultiOption("parking", value)}
              error={form.formState.errors.parking?.message}
            />
            <OptionSelect
              label="Breakfast Served"
              options={BOOLEAN_OPTIONS}
              value={form.watch("breakfastServed")}
              onChange={(value) =>
                form.setValue("breakfastServed", value as AddAccommodationsFormData["breakfastServed"], { shouldValidate: true })
              }
              error={form.formState.errors.breakfastServed?.message}
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
            />
            <MultiOptionTable
              label="Workspace"
              options={WORKSPACE_OPTIONS}
              values={form.watch("workspace")}
              onToggle={(value) => toggleMultiOption("workspace", value)}
              error={form.formState.errors.workspace?.message}
            />
            <OptionSelect
              label="Restaurant"
              options={BOOLEAN_OPTIONS}
              value={form.watch("restaurant")}
              onChange={(value) =>
                form.setValue("restaurant", value as AddAccommodationsFormData["restaurant"], { shouldValidate: true })
              }
              error={form.formState.errors.restaurant?.message}
            />
            <MultiOptionTable
              label="Pool"
              options={POOL_OPTIONS}
              values={form.watch("pool")}
              onToggle={(value) => toggleMultiOption("pool", value)}
              error={form.formState.errors.pool?.message}
            />
            <OptionSelect
              label="Rooftop Lounge"
              options={BOOLEAN_OPTIONS}
              value={form.watch("rooftopLounge")}
              onChange={(value) =>
                form.setValue("rooftopLounge", value as AddAccommodationsFormData["rooftopLounge"], { shouldValidate: true })
              }
              error={form.formState.errors.rooftopLounge?.message}
            />
            <MultiOptionTable
              label="Jacuzzi"
              options={JACUZZI_OPTIONS}
              values={form.watch("jacuzzi")}
              onToggle={(value) => toggleMultiOption("jacuzzi", value)}
              error={form.formState.errors.jacuzzi?.message}
            />
            <OptionSelect
              label="Gym"
              options={GYM_OPTIONS}
              value={form.watch("gym")}
              onChange={(value) =>
                form.setValue("gym", value as AddAccommodationsFormData["gym"], { shouldValidate: true })
              }
              error={form.formState.errors.gym?.message}
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
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Check-In Time</Label>
                <Input type="time" {...form.register("checkInTime")} />
                {form.formState.errors.checkInTime && (
                  <p className="text-xs text-destructive">{form.formState.errors.checkInTime.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Check-Out Time</Label>
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
                {form.formState.errors.bookingUrl && (
                  <p className="text-xs text-destructive">{form.formState.errors.bookingUrl.message}</p>
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
              disabled={isPending || (!form.formState.isDirty && !needsTitleBackfill)}
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
    </div>
  );
}
