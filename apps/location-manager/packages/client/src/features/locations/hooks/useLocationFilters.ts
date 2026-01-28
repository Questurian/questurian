import { useState } from "react";
import type { Category } from "@client/shared/services/api/types";

export function useLocationFilters() {
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

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

  const reset = () => {
    setSelectedCountry(null);
    setSelectedCity(null);
    setSelectedNeighborhood(null);
    setSelectedCategory(null);
  };

  return {
    selectedCountry,
    selectedCity,
    selectedNeighborhood,
    selectedCategory,
    setCountry: handleCountryChange,
    setCity: handleCityChange,
    setNeighborhood: handleNeighborhoodChange,
    setCategory: setSelectedCategory,
    reset,
    isFilterActive: !!(selectedCountry || selectedCity || selectedNeighborhood || selectedCategory)
  };
}
