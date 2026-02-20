import { Loader2 } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@client/components/ui/dialog";
import type { LocationCategory } from "@shared/types/location-category";

interface CitySelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  countries: { code: string; label: string }[];
  availableCities: { value: string; label: string }[];
  selectedCountryCode: string | null;
  selectedCityValue: string | null;
  selectedCategory: LocationCategory | null;
  isFetching: boolean;
  onCountryChange: (code: string | null) => void;
  onCityChange: (value: string | null) => void;
  onCategoryChange: (category: LocationCategory | null) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CitySelectionDialog({
  open,
  onOpenChange,
  countries,
  availableCities,
  selectedCountryCode,
  selectedCityValue,
  selectedCategory,
  isFetching,
  onCountryChange,
  onCityChange,
  onCategoryChange,
  onConfirm,
  onCancel,
}: CitySelectionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select City for AI Prompt</DialogTitle>
          <DialogDescription>
            Choose a city to include existing locations in the AI prompt. This helps avoid duplicate entries.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Country
            </label>
            <select
              value={selectedCountryCode || ""}
              onChange={(e) => onCountryChange(e.target.value || null)}
              className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select a country...</option>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.label}
                </option>
              ))}
            </select>
          </div>

          {selectedCountryCode && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                City
              </label>
              <select
                value={selectedCityValue || ""}
                onChange={(e) => onCityChange(e.target.value || null)}
                className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select a city...</option>
                {availableCities.map((city) => (
                  <option key={city.value} value={city.value}>
                    {city.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Category <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <select
              value={selectedCategory || ""}
              onChange={(e) => onCategoryChange((e.target.value || null) as LocationCategory | null)}
              className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All categories</option>
              <option value="dining">Dining</option>
              <option value="accommodations">Accommodations</option>
              <option value="attractions">Attractions</option>
              <option value="nightlife">Nightlife</option>
              <option value="key_locations">Key Locations</option>
            </select>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!selectedCountryCode || !selectedCityValue || isFetching}
          >
            {isFetching ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              "Copy Prompt"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
