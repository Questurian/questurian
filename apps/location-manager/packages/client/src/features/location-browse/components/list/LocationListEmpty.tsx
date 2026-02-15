interface LocationListEmptyProps {
  hasFilters?: boolean;
}

export function LocationListEmpty({ hasFilters = false }: LocationListEmptyProps) {
  return (
    <p>
      {hasFilters
        ? "No locations match your filters. Try adjusting your search criteria."
        : "No locations found. Add your first location to get started!"}
    </p>
  );
}
