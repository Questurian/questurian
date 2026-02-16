import type { LocationBasic } from "@client/shared/services/api/types";
import { LocationListItem } from "./LocationListItem";

interface LocationListProps {
  locations: LocationBasic[];
  onItemClick?: (id: number) => void;
}

export function LocationList({ locations, onItemClick }: LocationListProps) {
  return (
    <div className="flex flex-col gap-2">
      {locations.map((location) => (
        <LocationListItem
          key={location.id}
          location={location}
          onClick={onItemClick}
        />
      ))}
    </div>
  );
}
