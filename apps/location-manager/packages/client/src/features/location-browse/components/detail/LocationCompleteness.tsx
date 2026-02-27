import { useMemo, useState } from "react";
import type { LocationResponse } from "@client/shared/services/api/types";
import { Button } from "@client/components/ui";
import { Check, ChevronDown, ChevronUp, Loader2, RefreshCw, X } from "lucide-react";
import { CompletenessFieldEditModal } from "./CompletenessFieldEditModal";
import { useToast } from "@client/shared/hooks/useToast";
import {
  useFetchTripAdvisorPlace,
  useTripAdvisorPlaceStatus,
} from "@client/shared/services/api/hooks/useTripAdvisorPlace";
import { parseNightlifeDetails } from "../../utils/nightlife-details";
import { parseAccommodationsDetails } from "@client/shared/lib/accommodations-details";
import { parseAttractionsDetails } from "@client/shared/lib/attractions-details";

interface LocationCompletenessProps {
  locationDetail: LocationResponse;
}

export function LocationCompleteness({ locationDetail }: LocationCompletenessProps) {
  const { showToast } = useToast();
  const requiredFields = useMemo(() => {
    const contact = locationDetail.contact || {};
    const source = locationDetail.source || {};
    const isNightlife = locationDetail.category === "nightlife";
    const isAccommodations = locationDetail.category === "accommodations";
    const isAttractions = locationDetail.category === "attractions";
    const isKeyLocations = locationDetail.category === "key_locations";
    const nightlifeDetails = parseNightlifeDetails(locationDetail.nightlifeDetails);
    const accommodationsDetails = parseAccommodationsDetails(locationDetail.accommodationsDetails);
    const attractionsDetails = parseAttractionsDetails(locationDetail.attractionsDetails);
    const asRecord = (value: unknown): Record<string, unknown> | null =>
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    const asString = (value: unknown): string | null => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      }
      if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }
      return null;
    };
    const keyLocationsDetails = asRecord(locationDetail.keyLocationsDetails);
    const hasOperationHours = Boolean(
      locationDetail.operationHours &&
        Object.keys(locationDetail.operationHours).length > 0
    );

    const hasMedia =
      (locationDetail.uploads && locationDetail.uploads.length > 0) ||
      (locationDetail.instagram_embeds && locationDetail.instagram_embeds.length > 0);
    const hasIdealFor = Boolean(Array.isArray(locationDetail.idealFor) && locationDetail.idealFor.length > 0);
    const hasCuisines = Boolean(
      Array.isArray(locationDetail.tripadvisorCuisines) && locationDetail.tripadvisorCuisines.length > 0
    );
    const hasKeyLocationsHours = (() => {
      if (hasOperationHours) return true;
      const hoursValue = keyLocationsDetails?.hours;
      if (!hoursValue) return false;
      if (typeof hoursValue === "string") return hoursValue.trim().length > 0;
      if (Array.isArray(hoursValue)) return hoursValue.length > 0;
      if (typeof hoursValue === "object") {
        return Object.keys(hoursValue as Record<string, unknown>).length > 0;
      }
      return false;
    })();
    const hasKeyLocationImages = Array.isArray(keyLocationsDetails?.images) && keyLocationsDetails.images.length > 0;

    if (isNightlife) {
      return [
        { key: "name", label: "Name", present: Boolean(source.name?.trim() || nightlifeDetails.name) },
        { key: "sourceAddress", label: "Location", present: Boolean(source.address?.trim() || nightlifeDetails.location) },
        { key: "category", label: "Category", present: Boolean(locationDetail.category) },
        { key: "locationKey", label: "Location Key", present: Boolean(locationDetail.locationKey?.trim()) },
        { key: "district", label: "District", present: Boolean(locationDetail.district?.trim()) },
        {
          key: "nightlife.clubType",
          label: "Club Type",
          present: Boolean(nightlifeDetails.clubType || locationDetail.type?.trim()),
        },
        {
          key: "idealFor",
          label: "Ideal For",
          present: hasIdealFor || nightlifeDetails.idealFor.length > 0,
        },
        { key: "nightlife.music", label: "Music", present: nightlifeDetails.music.length > 0 },
        { key: "nightlife.venueType", label: "Venue Type", present: Boolean(nightlifeDetails.venueType) },
        { key: "nightlife.venueSize", label: "Venue Size", present: Boolean(nightlifeDetails.venueSize) },
        { key: "nightlife.spaceLayout", label: "Space Layout", present: nightlifeDetails.spaceLayout.length > 0 },
        { key: "nightlife.vibe", label: "Vibe", present: nightlifeDetails.vibe.length > 0 },
        { key: "nightlife.peakHours", label: "Peak Hours", present: Boolean(nightlifeDetails.peakHours) },
        {
          key: "nightlife.priceTier",
          label: "Price Tier",
          present: Boolean(nightlifeDetails.priceTier || locationDetail.priceLevel?.trim()),
        },
        { key: "nightlife.musicFormat", label: "Music Format", present: nightlifeDetails.musicFormat.length > 0 },
        {
          key: "nightlife.touristPresence",
          label: "Tourist Presence",
          present: Boolean(nightlifeDetails.touristPresence),
        },
        { key: "nightlife.dressCode", label: "Dress Code", present: nightlifeDetails.dressCode.length > 0 },
        { key: "nightlife.energyLevel", label: "Energy Level", present: Boolean(nightlifeDetails.energyLevel) },
        {
          key: "nightlife.vipAndBottleService",
          label: "VIP/Bottle Service",
          present: Boolean(nightlifeDetails.vipAndBottleService),
        },
        { key: "nightlife.crowdProfile", label: "Crowd Profile", present: Boolean(nightlifeDetails.crowdProfile) },
        {
          key: "nightlife.daytimeRestaurant",
          label: "Daytime Restaurant",
          present: nightlifeDetails.daytimeRestaurant === "0" || nightlifeDetails.daytimeRestaurant === "1",
        },
        { key: "media", label: "Images/Instagram", present: hasMedia },
      ];
    }

    if (isAccommodations) {
      return [
        { key: "name", label: "Name", present: Boolean(source.name?.trim() || accommodationsDetails.coreName) },
        { key: "sourceAddress", label: "Address", present: Boolean(source.address?.trim() || accommodationsDetails.address) },
        { key: "category", label: "Category", present: Boolean(locationDetail.category) },
        { key: "locationKey", label: "Location Key", present: Boolean(locationDetail.locationKey?.trim()) },
        { key: "district", label: "District", present: Boolean(locationDetail.district?.trim()) },
        {
          key: "accommodations.type",
          label: "Type",
          present: Boolean(locationDetail.type?.trim() || accommodationsDetails.coreType),
        },
        {
          key: "accommodations.price",
          label: "Price",
          present: Boolean(locationDetail.priceLevel?.trim() || accommodationsDetails.corePrice),
        },
        {
          key: "accommodations.perfectFor",
          label: "Perfect For",
          present: accommodationsDetails.perfectFor.length > 0,
        },
        {
          key: "accommodations.kidFriendly",
          label: "Kid Friendly",
          present: accommodationsDetails.kidFriendly !== null,
        },
        {
          key: "accommodations.ac",
          label: "AC",
          present: accommodationsDetails.ac !== null,
        },
        {
          key: "accommodations.wifi",
          label: "WiFi",
          present: accommodationsDetails.wifi !== null,
        },
        {
          key: "accommodations.extraGuestFee",
          label: "Extra Guest Fee",
          present: accommodationsDetails.extraGuestFee !== null,
        },
        {
          key: "accommodations.parking",
          label: "Parking",
          present: accommodationsDetails.parking.length > 0,
        },
        {
          key: "accommodations.breakfastServed",
          label: "Breakfast Served",
          present: accommodationsDetails.breakfastServed !== null,
        },
        {
          key: "accommodations.vibe",
          label: "Vibe",
          present: accommodationsDetails.vibe.length > 0,
        },
        {
          key: "accommodations.workspace",
          label: "Workspace",
          present: Boolean(accommodationsDetails.workspace),
        },
        {
          key: "accommodations.restaurant",
          label: "Restaurant",
          present: accommodationsDetails.restaurant !== null,
        },
        {
          key: "accommodations.pool",
          label: "Pool",
          present: accommodationsDetails.pool.length > 0,
        },
        {
          key: "accommodations.rooftopLounge",
          label: "Rooftop Lounge",
          present: accommodationsDetails.rooftopLounge !== null,
        },
        {
          key: "accommodations.jacuzzi",
          label: "Jacuzzi",
          present: accommodationsDetails.jacuzzi.length > 0,
        },
        {
          key: "accommodations.gym",
          label: "Gym",
          present: Boolean(accommodationsDetails.gym),
        },
        {
          key: "accommodations.walkability",
          label: "Walkability",
          present: Boolean(accommodationsDetails.walkability),
        },
        {
          key: "accommodations.checkInTime",
          label: "Check-In",
          present: Boolean(accommodationsDetails.checkInTime),
        },
        {
          key: "accommodations.checkOutTime",
          label: "Check-Out",
          present: Boolean(accommodationsDetails.checkOutTime),
        },
        {
          key: "phone",
          label: "Phone",
          present: Boolean(contact.phoneNumber?.trim() || accommodationsDetails.phone),
        },
        {
          key: "website",
          label: "Website",
          present: Boolean(contact.website?.trim() || accommodationsDetails.websiteUrl),
        },
        { key: "media", label: "Images/Instagram", present: hasMedia },
      ];
    }

    if (isAttractions) {
      return [
        { key: "name", label: "Name", present: Boolean(source.name?.trim()) },
        { key: "sourceAddress", label: "Address", present: Boolean(source.address?.trim()) },
        { key: "category", label: "Category", present: Boolean(locationDetail.category) },
        { key: "locationKey", label: "Location Key", present: Boolean(locationDetail.locationKey?.trim()) },
        { key: "district", label: "District", present: Boolean(locationDetail.district?.trim()) },
        {
          key: "attractions.type",
          label: "Type",
          present: Boolean(locationDetail.type?.trim() || attractionsDetails.attractionType),
        },
        {
          key: "attractions.pricing",
          label: "Pricing",
          present: Boolean(locationDetail.priceLevel?.trim() || attractionsDetails.pricing),
        },
        {
          key: "idealFor",
          label: "Ideal For",
          present: hasIdealFor || attractionsDetails.idealFor.length > 0,
        },
        {
          key: "attractions.bookingRequired",
          label: "Booking Required",
          present: attractionsDetails.bookingRequired !== null,
        },
        {
          key: "operationHours",
          label: "Hours",
          present: hasOperationHours || attractionsDetails.hasVisitHours,
        },
        {
          key: "website",
          label: "Website",
          present: Boolean(contact.website?.trim() || attractionsDetails.website),
        },
        { key: "media", label: "Images/Instagram", present: hasMedia },
      ];
    }

    if (isKeyLocations) {
      return [
        { key: "name", label: "Name", present: Boolean(source.name?.trim()) },
        { key: "sourceAddress", label: "Address", present: Boolean(source.address?.trim()) },
        { key: "category", label: "Category", present: Boolean(locationDetail.category) },
        {
          key: "locationKey",
          label: "Location Key",
          present: Boolean(locationDetail.locationKey?.trim() || asString(keyLocationsDetails?.location_key)),
        },
        {
          key: "keyLocations.type",
          label: "Type",
          present: Boolean(locationDetail.type?.trim() || asString(keyLocationsDetails?.location_type)),
        },
        {
          key: "keyLocations.status",
          label: "Status",
          present: Boolean(asString(keyLocationsDetails?.status)),
        },
        {
          key: "operationHours",
          label: "Hours",
          present: hasKeyLocationsHours,
        },
        {
          key: "district",
          label: "District",
          present: Boolean(locationDetail.district?.trim() || asString(keyLocationsDetails?.neighborhood)),
        },
        {
          key: "phone",
          label: "Phone",
          present: Boolean(contact.phoneNumber?.trim() || asString(keyLocationsDetails?.phone)),
        },
        {
          key: "website",
          label: "Website",
          present: Boolean(contact.website?.trim() || asString(keyLocationsDetails?.website)),
        },
        { key: "media", label: "Images/Instagram", present: hasMedia || hasKeyLocationImages },
      ];
    }

    const baseFields = [
      { key: "title", label: "Title", present: Boolean(locationDetail.title?.trim()) },
      { key: "name", label: "Name", present: Boolean(source.name?.trim()) },
      { key: "sourceAddress", label: "Source Address", present: Boolean(source.address?.trim()) },
      { key: "category", label: "Category", present: Boolean(locationDetail.category) },
      { key: "type", label: "Type", present: Boolean(locationDetail.type?.trim()) },
      { key: "locationKey", label: "Location Key", present: Boolean(locationDetail.locationKey?.trim()) },
      { key: "district", label: "District", present: Boolean(locationDetail.district?.trim()) },
      { key: "slug", label: "Slug", present: Boolean(locationDetail.slug?.trim()) },
      {
        key: "coordinates",
        label: "Coordinates",
        present: locationDetail.coordinates?.lat != null && locationDetail.coordinates?.lng != null,
      },
      {
        key: "ianaTimeId",
        label: "Time Zone (IANA)",
        present: Boolean(locationDetail.ianaTimeId?.trim()),
      },
      { key: "countryCode", label: "Country Code", present: Boolean(contact.countryCode?.trim()) },
      { key: "phone", label: "Phone", present: Boolean(contact.phoneNumber?.trim()) },
      { key: "website", label: "Website", present: Boolean(contact.website?.trim()) },
      { key: "contactUrl", label: "Google URL", present: Boolean(contact.url?.trim()) },
    ];

    const categoryFields = [
      { key: "idealFor", label: "Ideal For", present: hasIdealFor },
      { key: "cuisines", label: "Cuisines", present: hasCuisines },
      { key: "priceLevel", label: "Price Level", present: Boolean(locationDetail.priceLevel?.trim()) },
      { key: "operationHours", label: "Hours", present: hasOperationHours },
    ];

    return [
      ...baseFields,
      ...categoryFields,
      { key: "media", label: "Images/Instagram", present: hasMedia },
    ];
  }, [locationDetail]);

  const missingFields = useMemo(
    () => requiredFields.filter((field) => !field.present),
    [requiredFields]
  );
  const isComplete = missingFields.length === 0;
  const hasTripadvisorUrl = Boolean(locationDetail.tripadvisorUrl?.trim());
  const shouldShowTripAdvisorButton = hasTripadvisorUrl && !isComplete;

  const [completenessExpanded, setCompletenessExpanded] = useState<boolean | undefined>(undefined);
  const isCompletenessExpanded = completenessExpanded ?? !isComplete;
  const [editField, setEditField] = useState<{ key: string; label: string; present: boolean } | null>(null);

  const getEditField = (field: { key: string; label: string; present: boolean }) => {
    if (field.key.startsWith("nightlife.")) {
      return {
        key: "nightlifeDetails",
        label: "Nightlife Profile",
        present: field.present,
      };
    }
    if (field.key.startsWith("accommodations.")) {
      return {
        key: "accommodationsDetails",
        label: "Accommodations Profile",
        present: field.present,
      };
    }
    if (field.key.startsWith("attractions.")) {
      return {
        key: "attractionsDetails",
        label: "Attractions Profile",
        present: field.present,
      };
    }
    if (field.key.startsWith("keyLocations.")) {
      return {
        key: "keyLocationsDetails",
        label: "Key Locations Profile",
        present: field.present,
      };
    }
    return field;
  };

  const tripAdvisorPlaceStatusQuery = useTripAdvisorPlaceStatus({
    category: locationDetail.category,
    locationId: locationDetail.id,
    enabled: shouldShowTripAdvisorButton,
  });
  const fetchTripAdvisorPlaceMutation = useFetchTripAdvisorPlace({
    category: locationDetail.category,
    locationId: locationDetail.id,
    onSuccess: (data) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(data.message, centerPosition);
    },
    onError: (error) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(error.message || "Failed to fetch TripAdvisor place data", centerPosition);
    },
  });

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`text-xs font-semibold px-2 py-1 rounded shrink-0 ${
              isComplete
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-amber-500/15 text-amber-400"
            }`}
          >
            {isComplete ? "Complete" : "Missing data"}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {isComplete
              ? "All required fields present"
              : `${missingFields.length} required field${
                  missingFields.length === 1 ? "" : "s"
                } missing`}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {shouldShowTripAdvisorButton && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => fetchTripAdvisorPlaceMutation.mutate()}
              disabled={fetchTripAdvisorPlaceMutation.isPending}
              title="Fetch TripAdvisor place data from SerpAPI"
            >
              {fetchTripAdvisorPlaceMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-0.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-0.5" />
              )}
              {tripAdvisorPlaceStatusQuery.data?.hasPlaceData ? "Refetch place data" : "Fetch place data"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-muted-foreground hover:text-foreground"
            onClick={() => setCompletenessExpanded(!isCompletenessExpanded)}
            aria-expanded={isCompletenessExpanded}
          >
            {isCompletenessExpanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5 mr-0.5" />
                Hide
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5 mr-0.5" />
                Expand
              </>
            )}
          </Button>
        </div>
      </div>
      {isCompletenessExpanded && (
        <>
          {!isComplete && (
            <div className="flex flex-wrap gap-1">
              {missingFields.map((field) => (
                <button
                  key={field.key}
                  type="button"
                  onClick={() => setEditField(getEditField(field))}
                  className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
                  title={`Click to edit ${field.label}`}
                >
                  {field.label}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {requiredFields.map((field) => (
              <button
                key={field.key}
                type="button"
                onClick={() => setEditField(getEditField(field))}
                title={`Click to edit ${field.label}`}
                className={`flex items-center gap-2 rounded border px-2 py-1 text-xs text-left w-full ${
                  field.present
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                    : "border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
                }`}
              >
                {field.present ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                <span>{field.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {editField && (
        <CompletenessFieldEditModal
          field={editField}
          locationDetail={locationDetail}
          open={Boolean(editField)}
          onOpenChange={(open) => !open && setEditField(null)}
        />
      )}
    </div>
  );
}
