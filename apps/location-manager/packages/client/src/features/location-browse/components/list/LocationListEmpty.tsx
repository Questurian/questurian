import { useNavigate } from "react-router-dom";
import { Search, MapPin } from "lucide-react";
import { EmptyState } from "@client/shared/components/ui";

interface LocationListEmptyProps {
  hasFilters?: boolean;
}

export function LocationListEmpty({ hasFilters = false }: LocationListEmptyProps) {
  const navigate = useNavigate();

  if (hasFilters) {
    return (
      <EmptyState
        icon={Search}
        title="No matching locations"
        description="No locations match your filters. Try adjusting your search criteria."
      />
    );
  }

  return (
    <EmptyState
      icon={MapPin}
      title="No locations yet"
      description="Add your first location to get started!"
      actionLabel="Add Location"
      onAction={() => navigate("/add")}
    />
  );
}
