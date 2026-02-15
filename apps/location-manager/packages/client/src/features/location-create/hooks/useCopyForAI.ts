import { useState } from "react";
import { useCountries } from "@client/shared/hooks/useCountries";
import { extractCitiesForCountry, buildLocationKey } from "@client/shared/lib/filter-utils";
import { locationsApi } from "@client/shared/services/api";
import { AI_PROMPT_TEMPLATE } from "../constants/ai-prompt-template";
import type { LocationCategory } from "@shared/types/location-category";

export function useCopyForAI() {
  const [isCityDialogOpen, setIsCityDialogOpen] = useState(false);
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(null);
  const [selectedCityValue, setSelectedCityValue] = useState<string | null>(null);
  const [selectedDialogCategory, setSelectedDialogCategory] = useState<LocationCategory | null>(null);
  const [isFetchingLocations, setIsFetchingLocations] = useState(false);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const { data: countries = [] } = useCountries();

  const availableCities = selectedCountryCode
    ? extractCitiesForCountry(countries, selectedCountryCode)
    : [];

  const openDialog = () => setIsCityDialogOpen(true);

  const closeDialog = () => {
    setIsCityDialogOpen(false);
    setSelectedCountryCode(null);
    setSelectedCityValue(null);
    setSelectedDialogCategory(null);
  };

  const handleCountryChange = (code: string | null) => {
    setSelectedCountryCode(code);
    setSelectedCityValue(null);
  };

  const handleConfirmAndCopy = async () => {
    if (!selectedCountryCode || !selectedCityValue) return;

    setIsFetchingLocations(true);

    try {
      const locationKey = buildLocationKey(countries, selectedCountryCode, selectedCityValue, null);

      const response = await locationsApi.getLocationsBasic({
        locationKey,
        ...(selectedDialogCategory && { category: selectedDialogCategory }),
      });
      const existingNames = response.locations.map((loc) => loc.title || loc.name);

      const selectedCity = availableCities.find((c) => c.value === selectedCityValue);
      const cityLabel = selectedCity?.label || selectedCityValue;
      const countryLabel = countries.find((c) => c.code === selectedCountryCode)?.label || selectedCountryCode;

      const categoryLabel = selectedDialogCategory
        ? selectedDialogCategory.charAt(0).toUpperCase() + selectedDialogCategory.slice(1)
        : "All Categories";

      const existingLocationsSection = existingNames.length > 0
        ? `\n\n## IMPORTANT - Existing ${categoryLabel} Locations in ${cityLabel}, ${countryLabel}:\nThe following locations are ALREADY in the database. Do NOT include these in your output:\n${existingNames.map((name) => `- ${name}`).join("\n")}\n`
        : `\n\n## Note: No existing ${categoryLabel.toLowerCase()} locations found for ${cityLabel}, ${countryLabel}\n`;

      const enhancedPrompt = AI_PROMPT_TEMPLATE.replace(
        "[PASTE YOUR LOCATIONS HERE]",
        `[PASTE YOUR ${selectedDialogCategory ? selectedDialogCategory.toUpperCase() + " " : ""}LOCATIONS FOR ${cityLabel.toUpperCase()}, ${countryLabel.toUpperCase()} HERE]`
      ) + existingLocationsSection;

      await navigator.clipboard.writeText(enhancedPrompt);
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);

      closeDialog();
    } catch (err) {
      console.error("Failed to fetch locations or copy:", err);
    } finally {
      setIsFetchingLocations(false);
    }
  };

  return {
    isCityDialogOpen,
    selectedCountryCode,
    selectedCityValue,
    selectedDialogCategory,
    isFetchingLocations,
    copiedToClipboard,
    countries,
    availableCities,
    openDialog,
    closeDialog,
    handleCountryChange,
    setCityValue: setSelectedCityValue,
    setCategory: setSelectedDialogCategory,
    handleConfirmAndCopy,
  };
}
