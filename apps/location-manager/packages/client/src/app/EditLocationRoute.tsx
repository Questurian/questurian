import { useParams } from "react-router-dom";
import type { LocationCategory } from "@shared/types/location-category";
import { EditNightlifeLocation } from "@client/features/location-create";
import { EditLocation } from "@client/features/location-edit";

export function EditLocationRoute() {
  const { category } = useParams<{ category: LocationCategory }>();

  if (category === "nightlife") {
    return <EditNightlifeLocation />;
  }

  return <EditLocation />;
}
