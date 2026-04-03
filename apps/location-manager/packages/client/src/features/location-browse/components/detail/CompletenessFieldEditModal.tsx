import { useState, useEffect, useCallback } from "react";
import type { LocationResponse } from "@client/shared/services/api/types";
import type { UpdateMapsRequest } from "@client/shared/services/api/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@client/components/ui/dialog";
import { Button, Input, Textarea, Label } from "@client/components/ui";
import {
  NightlifeMultiOptionTable,
  NightlifeSingleOptionTable,
  TaxonomyLocationEditor,
} from "@client/shared/components/forms";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@client/components/ui/select";
import { useGenerateNeighborhoodDescription } from "@client/shared/services/api/hooks/useGenerateNeighborhoodDescription";
import { useUpdateLocation } from "@client/shared/services/api/hooks/useUpdateLocation";
import { useToast } from "@client/shared/hooks/useToast";
import { formatLocationHierarchy } from "@client/shared/lib/utils";
import { useLocationTypes } from "@client/shared/services/api/hooks/useLocationTypes";
import { getIdealForGroups } from "@shared/types/location-ideal-for";
import { Copy, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { isValidLocationKey } from "@client/shared/lib/taxonomy-location";
import { CUISINE_OPTION_GROUPS, CUISINE_OPTIONS } from "@client/shared/constants/cuisine-options";
import type { NightlifeOption } from "@client/shared/constants/nightlife-options";
import {
  CLUB_TYPE_OPTIONS,
  CROWD_PROFILE_OPTIONS,
  DAYTIME_RESTAURANT_OPTIONS,
  DRESS_CODE_OPTIONS,
  ENERGY_LEVEL_OPTIONS,
  MUSIC_FORMAT_OPTIONS,
  MUSIC_OPTIONS,
  PEAK_HOURS_OPTIONS,
  PRICE_TIER_OPTIONS,
  SPACE_LAYOUT_OPTIONS,
  TOURIST_PRESENCE_OPTIONS,
  VENUE_SIZE_OPTIONS,
  VENUE_TYPE_OPTIONS,
  VIP_BOTTLE_SERVICE_OPTIONS,
  VIBE_OPTIONS,
} from "@client/shared/constants/nightlife-options";
import {
  buildNightlifeFieldUpdatePayload,
  getNightlifeFieldDraftValue,
  isNightlifeFieldKey,
  isNightlifeMultiFieldKey,
  type NightlifeFieldKey,
} from "@client/shared/lib/nightlife-details";
import { toggleNightlifeMusicSelection } from "@client/shared/lib/nightlife-music";
import { DINING_ESTABLISHMENT_TYPE_GROUPS } from "@shared/types/dining-taxonomy";

interface FieldDef {
  key: string;
  label: string;
  present: boolean;
}

interface CompletenessFieldEditModalProps {
  field: FieldDef;
  locationDetail: LocationResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORIES = [
  { value: "dining", label: "Dining" },
  { value: "accommodations", label: "Accommodations" },
  { value: "attractions", label: "Attractions" },
  { value: "nightlife", label: "Nightlife" },
  { value: "key_locations", label: "Key Locations" },
] as const;

const PRICE_LEVELS = [
  { value: "free", label: "free" },
  { value: "$", label: "$" },
  { value: "$$", label: "$$" },
  { value: "$$$", label: "$$$" },
  { value: "$$$$", label: "$$$$" },
] as const;

const TIMEZONE_OPTIONS = [
  { value: "America/Lima", label: "America/Lima (Peru)" },
  { value: "America/Bogota", label: "America/Bogota (Colombia)" },
  { value: "America/Sao_Paulo", label: "America/Sao_Paulo (Brazil)" },
  { value: "America/Rio_Branco", label: "America/Rio_Branco (Brazil)" },
  { value: "America/Argentina/Buenos_Aires", label: "America/Argentina/Buenos_Aires (Argentina)" },
] as const;

const NIGHTLIFE_SINGLE_FIELD_OPTIONS: Partial<Record<NightlifeFieldKey, NightlifeOption[]>> = {
  "nightlife.clubType": CLUB_TYPE_OPTIONS,
  "nightlife.venueType": VENUE_TYPE_OPTIONS,
  "nightlife.venueSize": VENUE_SIZE_OPTIONS,
  "nightlife.peakHours": PEAK_HOURS_OPTIONS,
  "nightlife.priceTier": PRICE_TIER_OPTIONS,
  "nightlife.touristPresence": TOURIST_PRESENCE_OPTIONS,
  "nightlife.energyLevel": ENERGY_LEVEL_OPTIONS,
  "nightlife.vipAndBottleService": VIP_BOTTLE_SERVICE_OPTIONS,
  "nightlife.crowdProfile": CROWD_PROFILE_OPTIONS,
  "nightlife.daytimeRestaurant": DAYTIME_RESTAURANT_OPTIONS,
};

const NIGHTLIFE_MULTI_FIELD_OPTIONS: Partial<Record<NightlifeFieldKey, NightlifeOption[]>> = {
  "nightlife.music": MUSIC_OPTIONS,
  "nightlife.spaceLayout": SPACE_LAYOUT_OPTIONS,
  "nightlife.vibe": VIBE_OPTIONS,
  "nightlife.musicFormat": MUSIC_FORMAT_OPTIONS,
  "nightlife.dressCode": DRESS_CODE_OPTIONS,
};

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

type DayName = (typeof DAYS)[number];

interface TimeSlot {
  open: string; // HH:mm or HH:mm:ss
  close: string;
}

interface DayEntry {
  day: DayName;
  closed: boolean;
  slots: TimeSlot[];
}

interface OperationHoursData {
  hours: Array<{ day: string; hours: string }>;
}

function formatTimeForApi(value: string): string {
  if (!value) return "00:00:00";
  const parts = value.split(":");
  if (parts.length === 2) return `${value}:00`;
  return value;
}

function parseHoursString(hoursStr: string): { closed: boolean; slots: TimeSlot[] } {
  const trimmed = (hoursStr || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "closed") {
    return { closed: true, slots: [] };
  }
  const slots: TimeSlot[] = [];
  const ranges = trimmed.split(",").map((s) => s.trim());
  for (const range of ranges) {
    const [open, close] = range.split(/\s*-\s*/).map((s) => s.trim());
    if (open && close) {
      slots.push({
        open: open.length === 5 ? `${open}:00` : open,
        close: close.length === 5 ? `${close}:00` : close,
      });
    }
  }
  return {
    closed: false,
    slots: slots.length ? slots : [{ open: "09:00:00", close: "17:00:00" }],
  };
}

function dayEntryToHoursString(entry: DayEntry): string {
  if (entry.closed || entry.slots.length === 0) return "Closed";
  return entry.slots
    .map((s) => `${formatTimeForApi(s.open)} - ${formatTimeForApi(s.close)}`)
    .join(", ");
}

function parseOperationHoursJson(json: string): { dayEntries: DayEntry[] } {
  const dayEntries: DayEntry[] = DAYS.map((day) => ({
    day,
    closed: true,
    slots: [],
  }));

  if (!json?.trim()) return { dayEntries };

  try {
    const data = JSON.parse(json) as OperationHoursData;
    if (Array.isArray(data.hours)) {
      for (const row of data.hours) {
        const dayName = (row.day || "").trim();
        const dayIndex = DAYS.findIndex((d) => d.toLowerCase() === dayName.toLowerCase());
        if (dayIndex === -1) continue;
        const { closed, slots } = parseHoursString(row.hours || "");
        dayEntries[dayIndex] = {
          day: DAYS[dayIndex],
          closed,
          slots: slots.map((s) => ({
            open: s.open.length === 8 ? s.open.slice(0, 5) : s.open,
            close: s.close.length === 8 ? s.close.slice(0, 5) : s.close,
          })),
        };
      }
    }
  } catch {
    // Keep defaults when JSON parse fails
  }

  return { dayEntries };
}

function buildOperationHoursJson(dayEntries: DayEntry[]): string {
  const data: OperationHoursData = {
    hours: dayEntries.map((entry) => ({
      day: entry.day,
      hours: dayEntryToHoursString(entry),
    })),
  };
  return JSON.stringify(data, null, 2);
}

function parseCoordinateInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function getInitialValue(field: FieldDef, locationDetail: LocationResponse): string {
  const contact = locationDetail.contact || {};
  const source = locationDetail.source || {};

  switch (field.key) {
    case "title":
      return locationDetail.title?.trim() ?? "";
    case "name":
      return source.name?.trim() ?? "";
    case "sourceAddress":
      return source.address?.trim() ?? "";
    case "category":
      return locationDetail.category ?? "";
    case "type":
      return locationDetail.type?.trim() ?? "";
    case "locationKey":
      return locationDetail.locationKey?.trim() ?? "";
    case "district":
      return locationDetail.district?.trim() ?? "";
    case "coordinates":
      return "";
    case "ianaTimeId":
      return locationDetail.ianaTimeId?.trim() ?? "";
    case "countryCode":
      return contact.countryCode?.trim() ?? "";
    case "phone":
      return contact.phoneNumber?.trim() ?? "";
    case "website":
      return contact.website?.trim() ?? "";
    case "contactUrl":
      return contact.url?.trim() ?? "";
    case "tripadvisorUrl":
      return locationDetail.tripadvisorUrl?.trim() ?? "";
    case "neighborhoodDescription":
      return locationDetail.neighborhoodDescription?.trim() ?? "";
    case "idealFor":
      return Array.isArray(locationDetail.idealFor) ? locationDetail.idealFor.join(", ") : "";
    case "cuisines":
      return Array.isArray(locationDetail.tripadvisorCuisines)
        ? locationDetail.tripadvisorCuisines.join(", ")
        : "";
    case "priceLevel":
      return locationDetail.priceLevel?.trim() ?? "";
    case "nightlifeDetails":
      return locationDetail.nightlifeDetails
        ? JSON.stringify(locationDetail.nightlifeDetails, null, 2)
        : "";
    case "accommodationsDetails":
      return locationDetail.accommodationsDetails
        ? JSON.stringify(locationDetail.accommodationsDetails, null, 2)
        : "";
    case "attractionsDetails":
      return locationDetail.attractionsDetails
        ? JSON.stringify(locationDetail.attractionsDetails, null, 2)
        : "";
    case "keyLocationsDetails":
      return locationDetail.keyLocationsDetails
        ? JSON.stringify(locationDetail.keyLocationsDetails, null, 2)
        : "";
    case "operationHours":
      return locationDetail.operationHours
        ? JSON.stringify(locationDetail.operationHours, null, 2)
        : "";
    default:
      return "";
  }
}

function buildUpdatePayload(
  fieldKey: string,
  value: string
): Partial<UpdateMapsRequest> | null {
  const trimmed = value.trim();
  switch (fieldKey) {
    case "title":
      return { title: trimmed || undefined };
    case "name":
      return { name: trimmed || undefined };
    case "sourceAddress":
      return { address: trimmed || undefined };
    case "category":
      return null;
    case "type":
      return { type: trimmed || undefined };
    case "locationKey":
      return { locationKey: trimmed || undefined };
    case "district":
      return { district: trimmed || null };
    case "coordinates":
      return null;
    case "ianaTimeId":
      return { ianaTimeId: trimmed || null };
    case "countryCode":
      return { countryCode: trimmed || undefined };
    case "phone":
      return { phoneNumber: trimmed || undefined };
    case "website":
      return { website: trimmed || undefined };
    case "contactUrl":
      return null;
    case "tripadvisorUrl":
      return { tripadvisorUrl: trimmed || undefined };
    case "neighborhoodDescription":
      return { neighborhoodDescription: trimmed || undefined };
    case "idealFor": {
      const tags = trimmed
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      if (tags.length === 0) return null;
      return { idealFor: tags as UpdateMapsRequest["idealFor"] };
    }
    case "cuisines":
      return { tripadvisorCuisines: trimmed || null };
    case "priceLevel":
      return { priceLevel: trimmed || null };
    case "nightlifeDetails":
      return { nightlifeDetails: trimmed || null };
    case "accommodationsDetails":
      return { accommodationsDetails: trimmed || null };
    case "attractionsDetails":
      return { attractionsDetails: trimmed || null };
    case "keyLocationsDetails":
      return { keyLocationsDetails: trimmed || null };
    case "operationHours":
      return { operationHours: trimmed || undefined };
    case "media":
      return null;
    default:
      return null;
  }
}

export function CompletenessFieldEditModal({
  field,
  locationDetail,
  open,
  onOpenChange,
}: CompletenessFieldEditModalProps) {
  const { showToast } = useToast();
  const { mutate: updateLocation, isPending } = useUpdateLocation();
  const { data: locationTypes = [], isLoading: isLoadingTypes } = useLocationTypes(
    field.key === "type" ? locationDetail.category : undefined
  );
  const [value, setValue] = useState("");
  const [idealForDraft, setIdealForDraft] = useState<string[]>(
    Array.isArray(locationDetail.idealFor) ? locationDetail.idealFor : []
  );
  const [cuisinesDraft, setCuisinesDraft] = useState<string[]>(
    Array.isArray(locationDetail.tripadvisorCuisines) ? locationDetail.tripadvisorCuisines : []
  );
  const [nightlifeMultiDraft, setNightlifeMultiDraft] = useState<string[]>([]);
  const [taxonomyLocationKey, setTaxonomyLocationKey] = useState(
    locationDetail.locationKey?.trim() ?? ""
  );
  const [taxonomyDistrict, setTaxonomyDistrict] = useState(
    locationDetail.district?.trim() ?? ""
  );
  const [coordinateDraft, setCoordinateDraft] = useState({
    lat: locationDetail.coordinates?.lat != null ? String(locationDetail.coordinates.lat) : "",
    lng: locationDetail.coordinates?.lng != null ? String(locationDetail.coordinates.lng) : "",
  });
  const [dayEntries, setDayEntries] = useState<DayEntry[]>(() =>
    DAYS.map((day) => ({ day, closed: true, slots: [] }))
  );
  const locationHierarchyLabel = locationDetail.locationKey?.trim()
    ? formatLocationHierarchy(locationDetail.locationKey.trim())
    : null;
  const canGenerateNeighborhoodDescription = Boolean(
    locationDetail.district?.trim() || locationDetail.locationKey?.split("|")[2]?.trim()
  );

  const getInitialNightlifeValue = useCallback(
    (fieldKey: NightlifeFieldKey): string | string[] => {
      const draft = getNightlifeFieldDraftValue(locationDetail.nightlifeDetails, fieldKey);

      if (
        fieldKey === "nightlife.clubType" &&
        typeof draft === "string" &&
        draft.trim().length === 0
      ) {
        return locationDetail.type?.trim() ?? "";
      }

      if (
        fieldKey === "nightlife.priceTier" &&
        typeof draft === "string" &&
        draft.trim().length === 0
      ) {
        return locationDetail.priceLevel?.trim() ?? "";
      }

      return draft;
    },
    [locationDetail.nightlifeDetails, locationDetail.priceLevel, locationDetail.type]
  );

  const {
    mutate: generateNeighborhoodDescription,
    isPending: isGeneratingNeighborhoodDescription,
  } = useGenerateNeighborhoodDescription({
    category: locationDetail.category,
    locationId: locationDetail.id,
    onSuccess: (data) => {
      setValue(data.description);
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(
        data.source === "fallback"
          ? "AI was slow, so a contextual draft was generated. Review it and save when you're done."
          : "AI draft ready. Review it and save when you're done.",
        centerPosition
      );
    },
    onError: (error) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(
        error.message || "Failed to generate neighborhood description",
        centerPosition
      );
    },
  });

  useEffect(() => {
    if (open && field) {
      setValue(getInitialValue(field, locationDetail));
    }
  }, [open, field, locationDetail]);

  useEffect(() => {
    if (!open || !isNightlifeFieldKey(field.key)) return;

    const draft = getInitialNightlifeValue(field.key);
    if (isNightlifeMultiFieldKey(field.key)) {
      setNightlifeMultiDraft(Array.isArray(draft) ? draft : []);
      return;
    }

    setValue(typeof draft === "string" ? draft : "");
  }, [open, field, getInitialNightlifeValue]);

  useEffect(() => {
    if (open && field.key === "idealFor") {
      setIdealForDraft(Array.isArray(locationDetail.idealFor) ? locationDetail.idealFor : []);
    }
  }, [open, field, locationDetail]);

  useEffect(() => {
    if (open && field.key === "cuisines") {
      setCuisinesDraft(
        Array.isArray(locationDetail.tripadvisorCuisines)
          ? locationDetail.tripadvisorCuisines
          : []
      );
    }
  }, [open, field, locationDetail]);

  useEffect(() => {
    if (open && field.key === "operationHours") {
      const initial = getInitialValue(field, locationDetail);
      const { dayEntries: parsedEntries } = parseOperationHoursJson(initial);
      setDayEntries(parsedEntries);
    }
  }, [open, field, locationDetail]);

  useEffect(() => {
    if (open && (field.key === "locationKey" || field.key === "district")) {
      setTaxonomyLocationKey(locationDetail.locationKey?.trim() ?? "");
      setTaxonomyDistrict(locationDetail.district?.trim() ?? "");
    }
  }, [open, field, locationDetail]);

  const updateDay = useCallback((index: number, updater: (prev: DayEntry) => DayEntry) => {
    setDayEntries((prev) => {
      const next = [...prev];
      next[index] = updater(prev[index]);
      return next;
    });
  }, []);

  const setDayClosed = (index: number, closed: boolean) => {
    updateDay(index, (prev) =>
      closed
        ? { ...prev, closed: true, slots: [] }
        : { ...prev, closed: false, slots: [{ open: "09:00", close: "17:00" }] }
    );
  };

  const addSlot = (dayIndex: number) => {
    updateDay(dayIndex, (prev) => ({
      ...prev,
      slots: [...prev.slots, { open: "09:00", close: "17:00" }],
    }));
  };

  const removeSlot = (dayIndex: number, slotIndex: number) => {
    updateDay(dayIndex, (prev) => {
      const slots = prev.slots.filter((_, i) => i !== slotIndex);
      return { ...prev, slots, closed: slots.length === 0 };
    });
  };

  const updateSlot = (dayIndex: number, slotIndex: number, slotField: "open" | "close", time: string) => {
    updateDay(dayIndex, (prev) => {
      const slots = [...prev.slots];
      slots[slotIndex] = { ...slots[slotIndex], [slotField]: time };
      return { ...prev, slots };
    });
  };

  const copyText = async (text: string, label: string) => {
    const trimmed = text.trim();
    const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    if (!trimmed) {
      showToast(`${label} is empty`, centerPosition);
      return;
    }

    try {
      await navigator.clipboard.writeText(trimmed);
      showToast(`${label} copied`, centerPosition);
    } catch {
      showToast("Failed to copy value", centerPosition);
    }
  };

  const handleSave = () => {
    if (field.key === "media") {
      onOpenChange(false);
      return;
    }

    if (field.key === "operationHours") {
      updateLocation(
        {
          category: locationDetail.category,
          id: locationDetail.id,
          data: { operationHours: buildOperationHoursJson(dayEntries) },
        },
        {
          onSuccess: () => {
            const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            showToast("Hours saved", centerPosition);
            onOpenChange(false);
          },
          onError: (err) => {
            const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            showToast(err.message || "Failed to save hours", centerPosition);
          },
        }
      );
      return;
    }

    if (field.key === "coordinates") {
      const lat = parseCoordinateInput(coordinateDraft.lat);
      const lng = parseCoordinateInput(coordinateDraft.lng);

      if (lat == null || lng == null) {
        const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        showToast("Latitude and longitude are required", centerPosition);
        return;
      }

      if (lat < -90 || lat > 90) {
        const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        showToast("Latitude must be between -90 and 90", centerPosition);
        return;
      }

      if (lng < -180 || lng > 180) {
        const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        showToast("Longitude must be between -180 and 180", centerPosition);
        return;
      }

      updateLocation(
        {
          category: locationDetail.category,
          id: locationDetail.id,
          data: { lat, lng },
        },
        {
          onSuccess: () => {
            const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            showToast("Coordinates saved", centerPosition);
            onOpenChange(false);
          },
          onError: (err) => {
            const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            showToast(err.message || "Failed to save coordinates", centerPosition);
          },
        }
      );
      return;
    }

    if (field.key === "contactUrl") {
      const sourceName = locationDetail.source?.name?.trim();
      const sourceAddress = locationDetail.source?.address?.trim();
      if (!sourceName || !sourceAddress) {
        const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        showToast("Name and Source Address are required to generate Google URL", centerPosition);
        return;
      }

      updateLocation(
        {
          category: locationDetail.category,
          id: locationDetail.id,
          data: { name: sourceName, address: sourceAddress },
        },
        {
          onSuccess: () => {
            const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            showToast("Google URL regenerated", centerPosition);
            onOpenChange(false);
          },
          onError: (err) => {
            const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            showToast(err.message || "Failed to regenerate Google URL", centerPosition);
          },
        }
      );
      return;
    }

    if (field.key === "idealFor") {
      if (idealForDraft.length === 0) {
        const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        showToast("Select at least one Ideal For tag", centerPosition);
        return;
      }
      updateLocation(
        {
          category: locationDetail.category,
          id: locationDetail.id,
          data: { idealFor: idealForDraft },
        },
        {
          onSuccess: () => {
            const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            showToast("Ideal For saved", centerPosition);
            onOpenChange(false);
          },
          onError: (err) => {
            const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            showToast(err.message || "Failed to save Ideal For", centerPosition);
          },
        }
      );
      return;
    }

    if (field.key === "locationKey" || field.key === "district") {
      const normalizedLocationKey = taxonomyLocationKey.trim();
      if (normalizedLocationKey && !isValidLocationKey(normalizedLocationKey)) {
        const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        showToast("Location Key must be lowercase kebab-case (country|city|neighborhood)", centerPosition);
        return;
      }

      updateLocation(
        {
          category: locationDetail.category,
          id: locationDetail.id,
          data: {
            locationKey: normalizedLocationKey || undefined,
            district: taxonomyDistrict.trim() || null,
            autoApproveTaxonomy: true,
          },
        },
        {
          onSuccess: () => {
            const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            showToast("Location taxonomy saved", centerPosition);
            onOpenChange(false);
          },
          onError: (err) => {
            const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            showToast(err.message || "Failed to save location taxonomy", centerPosition);
          },
        }
      );
      return;
    }

    if (isNightlifeFieldKey(field.key)) {
      const draftValue = isNightlifeMultiFieldKey(field.key) ? nightlifeMultiDraft : value;
      const hasValue = Array.isArray(draftValue)
        ? draftValue.length > 0
        : draftValue.trim().length > 0;

      if (!hasValue) {
        const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        showToast(
          isNightlifeMultiFieldKey(field.key)
            ? `Select at least one ${field.label.toLowerCase()} option`
            : `Select an option for ${field.label.toLowerCase()}`,
          centerPosition
        );
        return;
      }

      updateLocation(
        {
          category: locationDetail.category,
          id: locationDetail.id,
          data: buildNightlifeFieldUpdatePayload(
            locationDetail.nightlifeDetails,
            field.key,
            draftValue
          ),
        },
        {
          onSuccess: () => {
            const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            showToast(`${field.label} saved`, centerPosition);
            onOpenChange(false);
          },
          onError: (err) => {
            const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            showToast(err.message || `Failed to save ${field.label}`, centerPosition);
          },
        }
      );
      return;
    }

    if (field.key === "cuisines") {
      updateLocation(
        {
          category: locationDetail.category,
          id: locationDetail.id,
          data: { tripadvisorCuisines: cuisinesDraft.length > 0 ? cuisinesDraft : null },
        },
        {
          onSuccess: () => {
            const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            showToast("Cuisines saved", centerPosition);
            onOpenChange(false);
          },
          onError: (err) => {
            const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            showToast(err.message || "Failed to save cuisines", centerPosition);
          },
        }
      );
      return;
    }

    const payload = buildUpdatePayload(field.key, value);
    if (payload === null) return;

    updateLocation(
      {
        category: locationDetail.category,
        id: locationDetail.id,
        data: payload,
      },
      {
        onSuccess: () => {
          const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
          showToast(`${field.label} saved`, centerPosition);
          onOpenChange(false);
        },
        onError: (err) => {
          const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
          showToast(err.message || `Failed to save ${field.label}`, centerPosition);
        },
      }
    );
  };

  const addIdealForTag = (tag: string) => {
    setIdealForDraft((prev) => {
      if (prev.includes(tag) || prev.length >= 4) return prev;
      return [...prev, tag];
    });
  };

  const removeIdealForTag = (tagToRemove: string) => {
    setIdealForDraft((prev) => prev.filter((tag) => tag !== tagToRemove));
  };

  const availableIdealForGroups = getIdealForGroups(locationDetail.category).map((group) => ({
    ...group,
    tags: group.tags.filter((tag) => !idealForDraft.includes(tag)),
  })).filter((group) => group.tags.length > 0);
  const availableCuisineOptions = CUISINE_OPTIONS.filter(
    (option) => !cuisinesDraft.includes(option)
  );
  const availableCuisineGroups = CUISINE_OPTION_GROUPS.map((group) => ({
    ...group,
    options: group.options.filter((option) => !cuisinesDraft.includes(option)),
  })).filter((group) => group.options.length > 0);

  const renderInput = () => {
    if (isNightlifeFieldKey(field.key)) {
      if (isNightlifeMultiFieldKey(field.key)) {
        return (
          <NightlifeMultiOptionTable
            label={field.label}
            options={NIGHTLIFE_MULTI_FIELD_OPTIONS[field.key] ?? []}
            values={nightlifeMultiDraft}
            onToggle={(selectedValue) =>
              setNightlifeMultiDraft((prev) =>
                field.key === "nightlife.music"
                  ? toggleNightlifeMusicSelection(prev, selectedValue)
                  : prev.includes(selectedValue)
                    ? prev.filter((item) => item !== selectedValue)
                    : [...prev, selectedValue]
              )
            }
          />
        );
      }

      return (
        <NightlifeSingleOptionTable
          label={field.label}
          options={NIGHTLIFE_SINGLE_FIELD_OPTIONS[field.key] ?? []}
          value={value}
          onChange={setValue}
          placeholder={`Select ${field.label.toLowerCase()}`}
        />
      );
    }

    switch (field.key) {
      case "category":
        return (
          <Select value={value || undefined} onValueChange={setValue}>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "priceLevel":
        return (
          <Select value={value || undefined} onValueChange={setValue}>
            <SelectTrigger>
              <SelectValue placeholder="Select price level" />
            </SelectTrigger>
            <SelectContent>
              {PRICE_LEVELS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "type":
        return (
          <Select value={value || undefined} onValueChange={setValue} disabled={isLoadingTypes}>
            <SelectTrigger>
              <SelectValue
                placeholder={
                  isLoadingTypes
                    ? "Loading types..."
                    : locationDetail.category === "dining"
                      ? "Select establishment type"
                      : "Select a type"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {locationDetail.category === "dining"
                ? DINING_ESTABLISHMENT_TYPE_GROUPS.map((group, groupIndex) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel className="pl-2 pr-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                        {group.label}
                      </SelectLabel>
                      {group.options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                      {groupIndex < DINING_ESTABLISHMENT_TYPE_GROUPS.length - 1 && <SelectSeparator />}
                    </SelectGroup>
                  ))
                : locationTypes.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
            </SelectContent>
          </Select>
        );
      case "locationKey":
      case "district":
        return (
          <TaxonomyLocationEditor
            locationKey={taxonomyLocationKey}
            district={taxonomyDistrict}
            onLocationKeyChange={setTaxonomyLocationKey}
            onDistrictChange={setTaxonomyDistrict}
            locationKeyError={
              taxonomyLocationKey.trim().length > 0 && !isValidLocationKey(taxonomyLocationKey.trim())
                ? "Location Key must be lowercase kebab-case (country|city|neighborhood)."
                : undefined
            }
            disabled={isPending}
          />
        );
      case "nightlifeDetails":
        return (
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={12}
            placeholder='{"name":"Venue Name","price_tier":"$$$"}'
            className="font-mono text-xs"
          />
        );
      case "accommodationsDetails":
        return (
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={12}
            placeholder='{"core":{"name":"The Meridian Grand","price":"$$$$"}}'
            className="font-mono text-xs"
          />
        );
      case "attractionsDetails":
        return (
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={12}
            placeholder='{"core":{"attraction_type":"museum","pricing":"$$"}}'
            className="font-mono text-xs"
          />
        );
      case "keyLocationsDetails":
        return (
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={12}
            placeholder='{"location_type":"airport","status":"active"}'
            className="font-mono text-xs"
          />
        );
      case "coordinates":
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-coordinates-lat">Latitude</Label>
                <Input
                  id="edit-coordinates-lat"
                  type="number"
                  step="any"
                  value={coordinateDraft.lat}
                  onChange={(e) =>
                    setCoordinateDraft((prev) => ({ ...prev, lat: e.target.value }))
                  }
                  placeholder="-12.0464"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-coordinates-lng">Longitude</Label>
                <Input
                  id="edit-coordinates-lng"
                  type="number"
                  step="any"
                  value={coordinateDraft.lng}
                  onChange={(e) =>
                    setCoordinateDraft((prev) => ({ ...prev, lng: e.target.value }))
                  }
                  placeholder="-77.0428"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => copyText(coordinateDraft.lat, "Latitude")}
                disabled={!coordinateDraft.lat.trim()}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy Lat
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => copyText(coordinateDraft.lng, "Longitude")}
                disabled={!coordinateDraft.lng.trim()}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy Lng
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() =>
                  copyText(
                    `${coordinateDraft.lat.trim()}, ${coordinateDraft.lng.trim()}`,
                    "Coordinates"
                  )
                }
                disabled={!coordinateDraft.lat.trim() || !coordinateDraft.lng.trim()}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy Both
              </Button>
            </div>
          </div>
        );
      case "ianaTimeId":
        return (
          <Select value={value || undefined} onValueChange={setValue}>
            <SelectTrigger>
              <SelectValue placeholder="Select a time zone" />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "neighborhoodDescription":
        return (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {canGenerateNeighborhoodDescription
                  ? `AI uses the current district/location context${locationHierarchyLabel ? `: ${locationHierarchyLabel}` : "."}`
                  : "Add a district or neighborhood in Location Key to generate an AI draft."}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => generateNeighborhoodDescription()}
                disabled={
                  isPending ||
                  isGeneratingNeighborhoodDescription ||
                  !canGenerateNeighborhoodDescription
                }
              >
                {isGeneratingNeighborhoodDescription ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                )}
                {value.trim() ? "Regenerate with AI" : "Generate with AI"}
              </Button>
            </div>
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Describe the neighborhood..."
              rows={5}
              className="resize-none"
            />
          </div>
        );
      case "idealFor":
        return (
          <div className="space-y-3">
            <Select
              key={`ideal-for-${idealForDraft.join("|") || "empty"}`}
              value={undefined}
              onValueChange={addIdealForTag}
              disabled={idealForDraft.length >= 4 || availableIdealForGroups.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    idealForDraft.length >= 4
                      ? "Maximum 4 tags selected"
                      : "Choose Ideal For tags (1-4)"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableIdealForGroups.map((group, groupIndex) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel className="pl-2 pr-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </SelectLabel>
                    {group.tags.map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag}
                      </SelectItem>
                    ))}
                    {groupIndex < availableIdealForGroups.length - 1 && <SelectSeparator />}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>

            {idealForDraft.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {idealForDraft.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                  >
                    {tag}
                    <button
                      type="button"
                      className="rounded-sm text-muted-foreground hover:text-foreground"
                      onClick={() => removeIdealForTag(tag)}
                      aria-label={`Remove ${tag}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      case "cuisines":
        return (
          <div className="space-y-3">
            <Select
              key={`cuisines-${cuisinesDraft.join("|") || "empty"}`}
              value={undefined}
              onValueChange={(selectedCuisine) =>
                setCuisinesDraft((prev) => {
                  if (prev.includes(selectedCuisine)) return prev;
                  return [...prev, selectedCuisine];
                })
              }
              disabled={availableCuisineOptions.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose cuisines" />
              </SelectTrigger>
              <SelectContent>
                {availableCuisineGroups.map((group, groupIndex) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel className="pl-2 pr-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </SelectLabel>
                    {group.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                    {groupIndex < availableCuisineGroups.length - 1 && <SelectSeparator />}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>

            {cuisinesDraft.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {cuisinesDraft.map((cuisine) => (
                    <span
                      key={cuisine}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                    >
                      {cuisine}
                      <button
                        type="button"
                        className="rounded-sm text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setCuisinesDraft((prev) => prev.filter((item) => item !== cuisine))
                        }
                        aria-label={`Remove ${cuisine}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setCuisinesDraft([])}
                >
                  Clear cuisines
                </Button>
              </div>
            )}
          </div>
        );
      case "operationHours":
        return (
          <div className="border rounded-lg divide-y bg-muted/30">
            {dayEntries.map((entry, dayIndex) => (
              <div key={entry.day} className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium text-sm w-24 shrink-0">{entry.day}</span>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Button
                      type="button"
                      variant={entry.closed ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => setDayClosed(dayIndex, true)}
                    >
                      Closed
                    </Button>
                    <Button
                      type="button"
                      variant={!entry.closed ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => setDayClosed(dayIndex, false)}
                    >
                      Open
                    </Button>
                    {!entry.closed && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => addSlot(dayIndex)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add slot
                      </Button>
                    )}
                  </div>
                </div>

                {!entry.closed && entry.slots.length > 0 && (
                  <div className="space-y-2 pl-0 sm:pl-24">
                    {entry.slots.map((slot, slotIndex) => (
                      <div key={slotIndex} className="flex items-center gap-2 flex-wrap">
                        <Input
                          type="time"
                          value={slot.open}
                          onChange={(e) => updateSlot(dayIndex, slotIndex, "open", e.target.value)}
                          className="w-28 h-8 text-sm"
                        />
                        <span className="text-muted-foreground text-sm">-</span>
                        <Input
                          type="time"
                          value={slot.close}
                          onChange={(e) => updateSlot(dayIndex, slotIndex, "close", e.target.value)}
                          className="w-28 h-8 text-sm"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeSlot(dayIndex, slotIndex)}
                          aria-label="Remove time slot"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      default:
        return (
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`Enter ${field.label.toLowerCase()}`}
            type={field.key === "website" ? "url" : "text"}
          />
        );
    }
  };

  const payload = buildUpdatePayload(field.key, value);
  const parsedLat = parseCoordinateInput(coordinateDraft.lat);
  const parsedLng = parseCoordinateInput(coordinateDraft.lng);
  const hasValidCoordinates =
    parsedLat != null &&
    parsedLng != null &&
    parsedLat >= -90 &&
    parsedLat <= 90 &&
    parsedLng >= -180 &&
    parsedLng <= 180;
  const canSave = (() => {
    if (field.key === "media") return true;
    if (field.key === "contactUrl") {
      return Boolean(locationDetail.source?.name?.trim() && locationDetail.source?.address?.trim());
    }
    if (isNightlifeFieldKey(field.key)) {
      return isNightlifeMultiFieldKey(field.key)
        ? nightlifeMultiDraft.length > 0
        : value.trim().length > 0;
    }
    if (field.key === "coordinates") return hasValidCoordinates;
    if (field.key === "locationKey" || field.key === "district") {
      return taxonomyLocationKey.trim().length === 0 || isValidLocationKey(taxonomyLocationKey.trim());
    }
    if (field.key === "cuisines") return true;
    if (field.key === "idealFor") return idealForDraft.length > 0;
    if (field.key === "operationHours") return true;
    return payload !== null;
  })();

  const description = (() => {
    if (field.key === "media") {
      return "Edit below in the Images/Instagram section.";
    }
    if (field.key === "contactUrl") {
      return "Google URL is generated from Name + Source Address. Click Save to regenerate.";
    }
    if (field.key === "type" && locationDetail.category === "dining") {
      return "Venue format only. Use cuisines for food identity and dishes.";
    }
    if (field.key === "cuisines") {
      return "Food identity only. Choose cuisine, dish, or food style tags.";
    }
    if (field.key === "neighborhoodDescription") {
      return "Write a short neighborhood overview, or use AI to draft one from the current district and location context before saving.";
    }
    if (field.key === "locationKey" || field.key === "district") {
      return "Use the builder to set country, city, and barrio/district. New taxonomy keys save as approved.";
    }
    if (field.key === "operationHours") {
      return "Set opening hours for each day. Use Closed or add one or more time ranges.";
    }
    if (field.key === "coordinates") {
      return "Use decimal latitude/longitude values. Latitude: -90 to 90, longitude: -180 to 180.";
    }
    if (field.key === "slug") {
      return "Slug is system-managed in this flow. Update related core fields to generate it.";
    }
    return field.present
      ? `Update the current ${field.label.toLowerCase()} for this location.`
      : `Add or update the missing ${field.label.toLowerCase()} for this location.`;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={
        field.key === "operationHours" || isNightlifeFieldKey(field.key)
          ? "max-w-2xl max-h-[90vh] overflow-y-auto"
          : field.key === "neighborhoodDescription"
            ? "sm:max-w-lg"
            : "sm:max-w-md"
      }>
        <DialogHeader>
          <DialogTitle>Edit {field.label}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {field.key === "media" ? (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            Edit below in the Images/Instagram section.
          </div>
        ) : field.key === "contactUrl" ? (
          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <p>Source Name: {locationDetail.source?.name || "Missing"}</p>
            <p>Source Address: {locationDetail.source?.address || "Missing"}</p>
          </div>
        ) : field.key === "operationHours" ||
            field.key === "locationKey" ||
            field.key === "district" ||
            field.key === "coordinates" ||
            isNightlifeFieldKey(field.key) ? (
          <div className="space-y-4 py-2">
            {renderInput()}
          </div>
        ) : (
          <div className="space-y-2 py-2">
            <Label htmlFor={`edit-${field.key}`}>{field.label}</Label>
            {renderInput()}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending || !canSave}>
            {isPending ? "Saving..." : field.key === "media" ? "Close" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
