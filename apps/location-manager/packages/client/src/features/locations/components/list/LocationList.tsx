import { LocationListItem } from "./LocationListItem";

interface Location {
  id: number;
  name: string;
  title: string | null;
  category: string;
  location?: string;
}

interface LocationListProps {
  locations: Location[];
  onItemClick?: (id: number) => void;
}

export function LocationList({ locations, onItemClick }: LocationListProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
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
