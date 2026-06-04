import { useEffect, useRef, useState } from "react";
import { useCountries } from "@client/shared/hooks/useCountries";
import {
  buildLocationKey,
  extractCitiesForCountry,
  extractNeighborhoodsForCity,
} from "@client/shared/lib/filter-utils";
import {
  useCreateTour,
  useSuggestTourTitle,
  useUpdateTour,
} from "@client/shared/services/api/hooks";
import type { Tour, TourDraftPreview } from "@client/shared/services/api/types";
import {
  EMPTY_TOUR_DRAFT,
  formatMissingFields,
  importDraftToDraft,
  isAbsoluteUrl,
  tourToDraft,
  type TourDraft,
} from "../TourFormDialog.types";

interface UseTourFormDraftParams {
  onOpenChange: (open: boolean) => void;
  tour?: Tour | null;
  initialMediaSetId?: string;
  onMediaSetIdPersist?: (id: string) => void;
  importDraft?: TourDraftPreview | null;
  prefilledLocationKey?: string | null;
  onCreated?: (tour: Tour) => void;
}

function parseLocationKey(key: string, countriesList: ReturnType<typeof useCountries>["data"] | undefined) {
  const countries = countriesList ?? [];
  if (!key || !countries.length) return { countryCode: "", cityValue: "", neighborhoodValue: "" };
  const [countryLabel, cityValue = "", neighborhoodValue = ""] = key.split("|");
  const country = countries.find((item) => item.label.toLowerCase() === countryLabel);
  return { countryCode: country?.code ?? "", cityValue, neighborhoodValue };
}

export function useTourFormDraft({
  onOpenChange,
  tour = null,
  initialMediaSetId = "",
  onMediaSetIdPersist,
  importDraft = null,
  prefilledLocationKey = null,
  onCreated,
}: UseTourFormDraftParams) {
  const initialLocationKey = prefilledLocationKey?.trim() ?? "";
  const [draft, setDraft] = useState<TourDraft>(() => {
    if (tour) return tourToDraft(tour);
    const base = importDraft ? importDraftToDraft(importDraft) : { ...EMPTY_TOUR_DRAFT };
    return {
      ...base,
      imgPayloadMediaSetId: initialMediaSetId,
      locationKey: base.locationKey || initialLocationKey,
    };
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [hasPendingLocalImage, setHasPendingLocalImage] = useState(false);
  const [isImageUploadPending, setIsImageUploadPending] = useState(false);
  const createTourMutation = useCreateTour();
  const updateTourMutation = useUpdateTour();
  const suggestTitleMutation = useSuggestTourTitle();
  const { data: countries = [], isLoading: isLoadingCountries } = useCountries();

  const [selectedCountry, setSelectedCountry] = useState(
    () => parseLocationKey(draft.locationKey, countries).countryCode
  );
  const [selectedCity, setSelectedCity] = useState(
    () => parseLocationKey(draft.locationKey, countries).cityValue
  );
  const [selectedNeighborhood, setSelectedNeighborhood] = useState(
    () => parseLocationKey(draft.locationKey, countries).neighborhoodValue
  );
  const locationInitialized = useRef(selectedCountry !== "");

  useEffect(() => {
    if (locationInitialized.current || !countries.length || !draft.locationKey) return;
    locationInitialized.current = true;
    const { countryCode, cityValue, neighborhoodValue } = parseLocationKey(draft.locationKey, countries);
    if (!countryCode) return;
    setSelectedCountry(countryCode);
    if (cityValue) setSelectedCity(cityValue);
    if (neighborhoodValue) setSelectedNeighborhood(neighborhoodValue);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries]);

  const cities = selectedCountry ? extractCitiesForCountry(countries, selectedCountry) : [];
  const neighborhoods = selectedCity
    ? extractNeighborhoodsForCity(countries, selectedCountry, selectedCity)
    : [];
  const isSaving = createTourMutation.isPending || updateTourMutation.isPending || isImageUploadPending;

  function updateDraft(nextDraft: Partial<TourDraft>) {
    setDraft((current) => ({
      ...current,
      ...nextDraft,
    }));
    setFormError(null);

    if (nextDraft.imgPayloadMediaSetId) {
      setHasPendingLocalImage(false);
      onMediaSetIdPersist?.(nextDraft.imgPayloadMediaSetId);
    }
  }

  function handleCountryChange(countryCode: string) {
    setSelectedCountry(countryCode);
    setSelectedCity("");
    setSelectedNeighborhood("");
    updateDraft({ locationKey: buildLocationKey(countries, countryCode || null, null, null) ?? "" });
  }

  function handleCityChange(cityValue: string) {
    setSelectedCity(cityValue);
    setSelectedNeighborhood("");
    updateDraft({ locationKey: buildLocationKey(countries, selectedCountry || null, cityValue || null, null) ?? "" });
  }

  function handleNeighborhoodChange(neighborhoodValue: string) {
    setSelectedNeighborhood(neighborhoodValue);
    updateDraft({
      locationKey:
        buildLocationKey(countries, selectedCountry || null, selectedCity || null, neighborhoodValue || null) ?? "",
    });
  }

  function suggestTitle(description?: string | null, duration?: string | null) {
    suggestTitleMutation.mutate(
      {
        sourceTitle: draft.sourceTitle,
        description: description ?? null,
        provider: draft.sourceProvider || null,
        duration: duration ?? null,
        price: draft.price || null,
        locationKey: draft.locationKey || null,
      },
      {
        onSuccess: (result) => updateDraft({ title: result.displayTitle }),
      }
    );
  }

  function saveDraft() {
    const title = draft.title.trim();
    const imgPayloadMediaSetId = draft.imgPayloadMediaSetId.trim();
    const bookingLink = draft.bookingLink.trim();
    const price = draft.price.trim();
    const missingTextFields = [
      !title ? "title" : null,
      !bookingLink ? "booking link" : null,
      !price ? "price" : null,
    ].filter((field): field is string => Boolean(field));

    if (missingTextFields.length > 0) {
      setFormError(`Missing ${formatMissingFields(missingTextFields)}.`);
      return;
    }

    if (!imgPayloadMediaSetId) {
      setFormError(
        hasPendingLocalImage
          ? "The photo is staged locally but is not uploaded yet. Finish crop review, then click Upload and use photo before saving."
          : "Choose an existing media set or upload a new photo before saving."
      );
      return;
    }

    if (!isAbsoluteUrl(bookingLink)) {
      setFormError("Booking link must be a valid absolute URL.");
      return;
    }

    const locationKeyTrimmed = draft.locationKey.trim();

    const payload = {
      title,
      imgPayloadMediaSetId,
      bookingLink,
      price,
      ...(locationKeyTrimmed ? { locationKey: locationKeyTrimmed } : {}),
      ...(draft.sourceProvider.trim() ? { sourceProvider: draft.sourceProvider.trim() } : {}),
      ...(draft.sourceUrl.trim() ? { sourceUrl: draft.sourceUrl.trim() } : {}),
      ...(draft.sourceTitle.trim() ? { sourceTitle: draft.sourceTitle.trim() } : {}),
      ...(draft.sourceImageUrl.trim() ? { sourceImageUrl: draft.sourceImageUrl.trim() } : {}),
      ...(draft.sourceProductCode.trim() ? { sourceProductCode: draft.sourceProductCode.trim() } : {}),
    };
    if (tour) {
      updateTourMutation.mutate(
        {
          id: tour.id,
          data: {
            title,
            imgPayloadMediaSetId,
            bookingLink,
            price,
            locationKey: locationKeyTrimmed || null,
            sourceProvider: draft.sourceProvider.trim() || null,
            sourceUrl: draft.sourceUrl.trim() || null,
            sourceTitle: draft.sourceTitle.trim() || null,
            sourceImageUrl: draft.sourceImageUrl.trim() || null,
            sourceProductCode: draft.sourceProductCode.trim() || null,
          },
        },
        { onSuccess: () => onOpenChange(false) }
      );
      return;
    }

    createTourMutation.mutate(payload, {
      onSuccess: (createdTour) => {
        onCreated?.(createdTour);
        onOpenChange(false);
      },
    });
  }

  return {
    cities,
    countries,
    createTourMutation,
    draft,
    formError,
    handleCityChange,
    handleCountryChange,
    handleNeighborhoodChange,
    isImageUploadPending,
    isLoadingCountries,
    isSaving,
    neighborhoods,
    saveDraft,
    selectedCity,
    selectedCountry,
    selectedNeighborhood,
    setHasPendingLocalImage,
    setIsImageUploadPending,
    suggestTitle,
    suggestTitleMutation,
    updateDraft,
    updateTourMutation,
  };
}
