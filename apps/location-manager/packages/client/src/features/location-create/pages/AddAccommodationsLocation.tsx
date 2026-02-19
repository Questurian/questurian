import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { BedDouble, CheckCircle2, ChevronLeft } from "lucide-react";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Button } from "@client/components/ui/button";
import { locationsApi } from "@client/shared/services/api";
import { useCreateLocation } from "@client/shared/services/api/hooks";
import { useLocationTypes } from "@client/shared/services/api/hooks/useLocationTypes";
import { buildAccommodationsDetails } from "@client/shared/lib/accommodations-details";
import {
  addAccommodationsSchema,
  addAccommodationsSubmitSchema,
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

type AccommodationsFormSection =
  | "step1"
  | "entities"
  | "core"
  | "stay"
  | "experience"
  | "details";

type MultiField = "perfectFor" | "parking" | "vibe" | "pool" | "jacuzzi";

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

interface SectionHeaderProps {
  title: string;
  isComplete?: boolean;
}

interface AccommodationsDraftPayload {
  formValues: AddAccommodationsFormData;
  prefillSignature: string | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

const ACCOMMODATIONS_DRAFT_STORAGE_KEY = "lm:add-accommodations:draft:v1";
const ACCOMMODATIONS_SECTION_ORDER: AccommodationsFormSection[] = [
  "step1",
  "entities",
  "core",
  "stay",
  "experience",
  "details",
];

const ACCOMMODATIONS_FORM_DEFAULT_VALUES: AddAccommodationsFormData = {
  name: "",
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
  workspace: "Dedicated Desk",
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

function isDraftEffectivelyEmpty(payload: AccommodationsDraftPayload) {
  if (payload.prefillSignature !== null) return false;
  return JSON.stringify(payload.formValues) === JSON.stringify(ACCOMMODATIONS_FORM_DEFAULT_VALUES);
}

function clearAccommodationsDraftFromStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACCOMMODATIONS_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage deletion failures.
  }
}

function readAccommodationsDraftFromStorage(): AccommodationsDraftPayload | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(ACCOMMODATIONS_DRAFT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AccommodationsDraftPayload>;
    const parsedValues = addAccommodationsSchema.partial().safeParse(parsed.formValues);
    if (!parsedValues.success) {
      clearAccommodationsDraftFromStorage();
      return null;
    }

    const prefillSignature =
      typeof parsed.prefillSignature === "string" ? parsed.prefillSignature : null;

    return {
      formValues: {
        ...ACCOMMODATIONS_FORM_DEFAULT_VALUES,
        ...(parsedValues.data as Partial<AddAccommodationsFormData>),
      },
      prefillSignature,
    };
  } catch {
    clearAccommodationsDraftFromStorage();
    return null;
  }
}

function writeAccommodationsDraftToStorage(payload: AccommodationsDraftPayload) {
  if (typeof window === "undefined") return;

  try {
    if (isDraftEffectivelyEmpty(payload)) {
      window.localStorage.removeItem(ACCOMMODATIONS_DRAFT_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(ACCOMMODATIONS_DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures.
  }
}

function toBoolean(value: "yes" | "no"): boolean {
  return value === "yes";
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

function SectionHeader({ title, isComplete = false }: SectionHeaderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {isComplete && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Complete
          </span>
        )}
      </div>
    </div>
  );
}

export function AddAccommodationsLocation() {
  const [activeSection, setActiveSection] = useState<AccommodationsFormSection>("step1");
  const [isPrefillingGoogle, setIsPrefillingGoogle] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillSignature, setPrefillSignature] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState<string | null>(null);
  const hasHydratedDraftRef = useRef(false);

  const form = useForm<AddAccommodationsFormData>({
    resolver: zodResolver(addAccommodationsSchema),
    defaultValues: ACCOMMODATIONS_FORM_DEFAULT_VALUES,
    mode: "onChange",
  });

  const { mutate: createLocation, isPending, error } = useCreateLocation();
  const { data: locationTypes = [], isLoading: isLoadingTypes } = useLocationTypes("accommodations");

  useEffect(() => {
    const draft = readAccommodationsDraftFromStorage();
    if (!draft) {
      hasHydratedDraftRef.current = true;
      return;
    }

    form.reset(draft.formValues);
    setPrefillSignature(draft.prefillSignature);
    setPrefillMessage("Restored unsaved draft from your previous session.");
    setPrefillError(null);
    hasHydratedDraftRef.current = true;
  }, [form]);

  useEffect(() => {
    const subscription = form.watch((value) => {
      if (!hasHydratedDraftRef.current) return;

      writeAccommodationsDraftToStorage({
        formValues: {
          ...ACCOMMODATIONS_FORM_DEFAULT_VALUES,
          ...(value as Partial<AddAccommodationsFormData>),
        },
        prefillSignature,
      });
    });

    return () => subscription.unsubscribe();
  }, [form, prefillSignature]);

  useEffect(() => {
    if (!hasHydratedDraftRef.current) return;

    writeAccommodationsDraftToStorage({
      formValues: form.getValues(),
      prefillSignature,
    });
  }, [form, prefillSignature]);

  const currentPrefillSignature = buildAccommodationsPrefillSignature(
    form.watch("name"),
    form.watch("address")
  );
  const isPrefillReady = prefillSignature !== null && prefillSignature === currentPrefillSignature;
  const prefillIsStale = prefillSignature !== null && !isPrefillReady;

  const hasValue = (value: string | undefined) => Boolean(value && value.trim().length > 0);
  const stepOneComplete = isPrefillReady;
  const entitiesComplete = isPrefillReady;
  const coreComplete = Boolean(form.watch("price")) && (form.watch("type")?.length ?? 0) > 0;
  const stayComplete =
    (form.watch("perfectFor")?.length ?? 0) > 0 &&
    (form.watch("parking")?.length ?? 0) > 0;
  const experienceComplete =
    (form.watch("vibe")?.length ?? 0) > 0 &&
    (form.watch("pool")?.length ?? 0) > 0 &&
    (form.watch("jacuzzi")?.length ?? 0) > 0;
  const detailsComplete =
    hasValue(form.watch("phone")) &&
    hasValue(form.watch("websiteUrl")) &&
    hasValue(form.watch("checkInTime")) &&
    hasValue(form.watch("checkOutTime"));

  const canOpenSection = (section: AccommodationsFormSection) => {
    if (section === "step1") return true;
    return isPrefillReady;
  };

  const goToSection = (section: AccommodationsFormSection) => {
    if (!canOpenSection(section)) return;
    setActiveSection(section);
  };

  const goToNextSection = () => {
    const currentIndex = ACCOMMODATIONS_SECTION_ORDER.indexOf(activeSection);
    const nextSection = ACCOMMODATIONS_SECTION_ORDER[currentIndex + 1];
    if (nextSection) {
      goToSection(nextSection);
    }
  };

  const goToPreviousSection = () => {
    const currentIndex = ACCOMMODATIONS_SECTION_ORDER.indexOf(activeSection);
    const previousSection = ACCOMMODATIONS_SECTION_ORDER[currentIndex - 1];
    if (previousSection) {
      goToSection(previousSection);
    }
  };

  const flowSections: Array<{ key: AccommodationsFormSection; label: string; complete: boolean }> = [
    { key: "step1", label: "Step 1", complete: stepOneComplete },
    { key: "entities", label: "Entities", complete: entitiesComplete },
    { key: "core", label: "Core", complete: coreComplete },
    { key: "stay", label: "Stay", complete: stayComplete },
    { key: "experience", label: "Experience", complete: experienceComplete },
    { key: "details", label: "Details", complete: detailsComplete },
  ];

  useEffect(() => {
    if (!isPrefillReady && activeSection !== "step1") {
      setActiveSection("step1");
    }
  }, [isPrefillReady, activeSection]);

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
      setPrefillSignature(null);
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
      form.setValue("googleMapsUrl", prefill.googleUrl, {
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
      if (prefill.phoneNumber) {
        form.setValue("phone", prefill.phoneNumber, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
      }
      if (prefill.website) {
        form.setValue("websiteUrl", prefill.website, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
      }

      setPrefillSignature(buildAccommodationsPrefillSignature(name, normalizedAddress));
      setPrefillMessage(
        "Google lookup complete. Place ID, coordinates, location key, district, time zone, phone, and website were prefilled when available."
      );
      setActiveSection("entities");
    } catch (lookupError) {
      setPrefillSignature(null);
      setPrefillError(getErrorMessage(lookupError));
    } finally {
      setIsPrefillingGoogle(false);
    }
  };

  const onSubmit = (data: AddAccommodationsFormData) => {
    const submitValidation = addAccommodationsSubmitSchema.safeParse({
      prefillSignature,
      formValues: data,
    });

    if (!submitValidation.success) {
      const firstIssue = submitValidation.error.issues[0]?.message;
      setPrefillError(firstIssue || "Run Name + Address Google lookup before creating the accommodations document.");
      return;
    }

    const normalizedAddress = normalizeAccommodationsAddress(data.address);
    const latValue = data.latitude?.trim() ? Number(data.latitude) : undefined;
    const lngValue = data.longitude?.trim() ? Number(data.longitude) : undefined;

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

    createLocation(
      {
        name: data.name,
        title: data.name,
        address: normalizedAddress,
        category: "accommodations",
        type: data.type || undefined,
        priceLevel: data.price,
        phoneNumber: data.phone || undefined,
        website: data.websiteUrl || undefined,
        district: data.district || undefined,
        locationKey: data.locationKey || undefined,
        ianaTimeId: data.ianaTimeId || undefined,
        placeId: data.placeId || undefined,
        url: data.googleUrl || data.googleMapsUrl || undefined,
        lat: Number.isFinite(latValue) ? latValue : undefined,
        lng: Number.isFinite(lngValue) ? lngValue : undefined,
        accommodationsDetails,
      },
      {
        onSuccess: (response) => {
          setCreatedName(response.title || response.source.name);
          form.reset(ACCOMMODATIONS_FORM_DEFAULT_VALUES);
          setPrefillSignature(null);
          setPrefillMessage(null);
          setPrefillError(null);
          setActiveSection("step1");
          clearAccommodationsDraftFromStorage();
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-6xl rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <BedDouble className="w-4 h-4 text-muted-foreground" />
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground underline">
                  Add Accommodations
                </h1>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                asChild
                className="h-9 border-border/80 bg-background/60 px-3 text-foreground hover:bg-accent/70"
              >
                <Link to="/add">
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Link>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {flowSections.map((section, index) => {
                const isActive = activeSection === section.key;
                const isDisabled = !canOpenSection(section.key);
                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => goToSection(section.key)}
                    disabled={isDisabled}
                    className={`inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? "border-border bg-muted text-foreground"
                        : isDisabled
                          ? "cursor-not-allowed border-border/50 bg-background text-muted-foreground/55"
                          : "border-border/60 bg-background text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    <span>{index + 1}.</span>
                    <span>{section.label}</span>
                    {section.complete && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                  </button>
                );
              })}
            </div>
          </div>

          {createdName && (
            <div className="mb-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
              Created accommodations document: {createdName}
            </div>
          )}

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {activeSection === "step1" && (
              <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
                <SectionHeader title="Step 1" isComplete={stepOneComplete} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input placeholder="Location Name" {...form.register("name")} />
                    {form.formState.errors.name && (
                      <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Input placeholder="Location Address" {...form.register("address")} />
                    {form.formState.errors.address && (
                      <p className="text-xs text-destructive">{form.formState.errors.address.message}</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end border-t border-border/70 pt-4">
                  <Button
                    type="button"
                    onClick={() => void handleGooglePrefill()}
                    disabled={isPrefillingGoogle || isPending}
                  >
                    {isPrefillingGoogle ? "Continuing..." : "Continue"}
                  </Button>
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
                    Name or address changed after lookup. Run Google lookup again to refresh Place ID and coordinates.
                  </div>
                )}
              </section>
            )}

            {isPrefillReady && activeSection === "entities" && (
              <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
                <SectionHeader title="Entities Fields (Optional Manual Overrides)" isComplete={entitiesComplete} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <div className="flex justify-between border-t border-border/70 pt-4">
                  <Button type="button" variant="outline" onClick={goToPreviousSection}>
                    Previous
                  </Button>
                  <Button type="button" onClick={goToNextSection}>
                    Next
                  </Button>
                </div>
              </section>
            )}

            {isPrefillReady && activeSection === "core" && (
              <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
                <SectionHeader title="Core" isComplete={coreComplete} />
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
                <div className="flex justify-between border-t border-border/70 pt-4">
                  <Button type="button" variant="outline" onClick={goToPreviousSection}>
                    Previous
                  </Button>
                  <Button type="button" onClick={goToNextSection}>
                    Next
                  </Button>
                </div>
              </section>
            )}

            {isPrefillReady && activeSection === "stay" && (
              <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
                <SectionHeader title="The Stay" isComplete={stayComplete} />
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
                <div className="flex justify-between border-t border-border/70 pt-4">
                  <Button type="button" variant="outline" onClick={goToPreviousSection}>
                    Previous
                  </Button>
                  <Button type="button" onClick={goToNextSection}>
                    Next
                  </Button>
                </div>
              </section>
            )}

            {isPrefillReady && activeSection === "experience" && (
              <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
                <SectionHeader title="The Experience" isComplete={experienceComplete} />
                <MultiOptionTable
                  label="Vibe"
                  options={VIBE_OPTIONS}
                  values={form.watch("vibe")}
                  onToggle={(value) => toggleMultiOption("vibe", value)}
                  error={form.formState.errors.vibe?.message}
                />
                <OptionSelect
                  label="Workspace"
                  options={WORKSPACE_OPTIONS}
                  value={form.watch("workspace")}
                  onChange={(value) =>
                    form.setValue("workspace", value as AddAccommodationsFormData["workspace"], { shouldValidate: true })
                  }
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
                <div className="flex justify-between border-t border-border/70 pt-4">
                  <Button type="button" variant="outline" onClick={goToPreviousSection}>
                    Previous
                  </Button>
                  <Button type="button" onClick={goToNextSection}>
                    Next
                  </Button>
                </div>
              </section>
            )}

            {isPrefillReady && activeSection === "details" && (
              <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
                <SectionHeader title="The Details" isComplete={detailsComplete} />
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
                <div className="flex justify-between border-t border-border/70 pt-4">
                  <Button type="button" variant="outline" onClick={goToPreviousSection}>
                    Previous
                  </Button>
                  <Button type="submit" disabled={!isPrefillReady || !form.formState.isValid || isPending}>
                    {isPending ? "Creating..." : "Create Accommodations Document"}
                  </Button>
                </div>
              </section>
            )}

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Error: {error.message}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
