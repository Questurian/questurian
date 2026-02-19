import { useState } from "react";
import type { Category } from "@client/shared/services/api/types";

export type CompletionStatus = "all" | "complete" | "incomplete";

export function useLocationFilters() {
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([]);
  const [selectedCompletionStatus, setSelectedCompletionStatus] = useState<CompletionStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Cascading handlers - reset child selections when parent changes
  const handleCountryChange = (country: string | null) => {
    setSelectedCountry(country);
    setSelectedCity(null); // Reset city when country changes
    setSelectedNeighborhood(null); // Reset neighborhood when country changes
  };

  const handleCityChange = (city: string | null) => {
    setSelectedCity(city);
    setSelectedNeighborhood(null); // Reset neighborhood when city changes
  };

  const handleNeighborhoodChange = (neighborhood: string | null) => {
    setSelectedNeighborhood(neighborhood);
  };

  const toggleCategory = (category: Category) => {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category]
    );
  };

  const reset = () => {
    setSelectedCountry(null);
    setSelectedCity(null);
    setSelectedNeighborhood(null);
    setSelectedCategories([]);
    setSelectedCompletionStatus("all");
    setSearchQuery("");
  };

  return {
    selectedCountry,
    selectedCity,
    selectedNeighborhood,
    selectedCategories,
    selectedCompletionStatus,
    searchQuery,
    setCountry: handleCountryChange,
    setCity: handleCityChange,
    setNeighborhood: handleNeighborhoodChange,
    toggleCategory,
    setCompletionStatus: setSelectedCompletionStatus,
    setSearch: setSearchQuery,
    reset,
    isFilterActive: !!(
      selectedCountry ||
      selectedCity ||
      selectedNeighborhood ||
      selectedCategories.length > 0 ||
      selectedCompletionStatus !== "all" ||
      searchQuery
    )
  };
}
