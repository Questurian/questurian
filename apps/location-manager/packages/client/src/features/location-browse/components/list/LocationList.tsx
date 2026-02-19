import type { LocationBasic } from "@client/shared/services/api/types";
import { LocationListItem } from "./LocationListItem";

interface LocationListProps {
  locations: LocationBasic[];
  onItemClick?: (id: number) => void;
  isLocationExpanded: (location: LocationBasic) => boolean;
  onLocationExpandedChange: (location: LocationBasic, expanded: boolean) => void;
}

export function LocationList({
  locations,
  onItemClick,
  isLocationExpanded,
  onLocationExpandedChange,
}: LocationListProps) {
  return (
    <div className="flex flex-col gap-2">
      {locations.map((location) => (
        <LocationListItem
          key={location.id}
          location={location}
          onClick={onItemClick}
          isExpanded={isLocationExpanded(location)}
          onExpandedChange={(expanded) => onLocationExpandedChange(location, expanded)}
        />
      ))}
    </div>
  );
}
