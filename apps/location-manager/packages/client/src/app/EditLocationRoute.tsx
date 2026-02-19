import { useParams } from "react-router-dom";
import type { LocationCategory } from "@shared/types/location-category";
import { EditNightlifeLocation, EditAccommodationsLocation } from "@client/features/location-create";
import { EditLocation } from "@client/features/location-edit";

export function EditLocationRoute() {
  const { category } = useParams<{ category: LocationCategory }>();

  if (category === "nightlife") {
    return <EditNightlifeLocation />;
  }

  if (category === "accommodations") {
    return <EditAccommodationsLocation />;
  }

  return <EditLocation />;
}
