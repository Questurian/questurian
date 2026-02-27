import { useEffect, useMemo, useState } from "react";
import { Input } from "@client/components/ui/input";
import { Button } from "@client/components/ui/button";
import { Label } from "@client/components/ui/label";
import {
  buildLocationKey,
  isValidLocationKey,
  parseLocationKey,
  slugifyTaxonomyPart,
} from "@client/shared/lib/taxonomy-location";

interface TaxonomyLocationEditorProps {
  locationKey: string;
  district: string;
  onLocationKeyChange: (next: string) => void;
  onDistrictChange: (next: string) => void;
  locationKeyError?: string;
  disabled?: boolean;
}

export function TaxonomyLocationEditor({
  locationKey,
  district,
  onLocationKeyChange,
  onDistrictChange,
  locationKeyError,
  disabled = false,
}: TaxonomyLocationEditorProps) {
  const normalizedLocationKey = typeof locationKey === "string" ? locationKey : "";
  const normalizedDistrict = typeof district === "string" ? district : "";
  const [manualOverride, setManualOverride] = useState(false);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [barrio, setBarrio] = useState("");

  useEffect(() => {
    const parsed = parseLocationKey(normalizedLocationKey);
    const nextBarrio = normalizedDistrict.trim() || parsed.neighborhood;

    setCountry((prev) => (prev === parsed.country ? prev : parsed.country));
    setCity((prev) => (prev === parsed.city ? prev : parsed.city));
    setBarrio((prev) => (prev === nextBarrio ? prev : nextBarrio));
  }, [normalizedLocationKey, normalizedDistrict]);

  const computedLocationKey = useMemo(
    () =>
      buildLocationKey({
        country,
        city,
        neighborhood: barrio,
      }),
    [country, city, barrio]
  );
  const manualKeyInvalid = manualOverride && !isValidLocationKey(normalizedLocationKey);
  const keyError = locationKeyError || (manualKeyInvalid ? "Location Key must be lowercase kebab-case (country|city|neighborhood)." : undefined);

  const handleToggleManualOverride = () => {
    const nextManualOverride = !manualOverride;
    setManualOverride(nextManualOverride);

    if (!nextManualOverride) {
      const parsed = parseLocationKey(normalizedLocationKey);
      setCountry(parsed.country);
      setCity(parsed.city);
      if (!normalizedDistrict.trim() && parsed.neighborhood) {
        setBarrio(parsed.neighborhood);
        onDistrictChange(parsed.neighborhood);
      }
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Location Taxonomy
        </p>
        <Button
          type="button"
          variant={manualOverride ? "secondary" : "outline"}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={handleToggleManualOverride}
          disabled={disabled}
        >
          {manualOverride ? "Use Builder" : "Manual Override"}
        </Button>
      </div>

      {!manualOverride && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="taxonomy-country">Country</Label>
            <Input
              id="taxonomy-country"
              value={country}
              placeholder="peru"
              onChange={(event) => {
                const nextCountry = slugifyTaxonomyPart(event.target.value);
                const resetChildFields = !nextCountry;
                const nextCity = resetChildFields ? "" : city;
                const nextBarrio = resetChildFields ? "" : barrio;
                setCountry(nextCountry);
                if (resetChildFields) {
                  setCity("");
                  setBarrio("");
                  onDistrictChange("");
                }
                onLocationKeyChange(
                  buildLocationKey({
                    country: nextCountry,
                    city: nextCity,
                    neighborhood: nextBarrio,
                  })
                );
              }}
              disabled={disabled}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="taxonomy-city">City</Label>
            <Input
              id="taxonomy-city"
              value={city}
              placeholder="lima"
              onChange={(event) => {
                const nextCity = slugifyTaxonomyPart(event.target.value);
                const resetBarrio = !nextCity;
                const nextBarrio = resetBarrio ? "" : barrio;
                setCity(nextCity);
                if (resetBarrio) {
                  setBarrio("");
                  onDistrictChange("");
                }
                onLocationKeyChange(
                  buildLocationKey({
                    country,
                    city: nextCity,
                    neighborhood: nextBarrio,
                  })
                );
              }}
              disabled={disabled || !country}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="taxonomy-barrio">Barrio / District</Label>
            <Input
              id="taxonomy-barrio"
              value={barrio}
              placeholder="miraflores"
              onChange={(event) => {
                const nextBarrio = event.target.value;
                setBarrio(nextBarrio);
                onDistrictChange(nextBarrio);
                onLocationKeyChange(
                  buildLocationKey({
                    country,
                    city,
                    neighborhood: nextBarrio,
                  })
                );
              }}
              disabled={disabled || !country || !city}
            />
          </div>
        </div>
      )}

      {manualOverride && (
        <div className="space-y-1.5">
          <Label htmlFor="taxonomy-location-key">Location Key</Label>
            <Input
              id="taxonomy-location-key"
              value={normalizedLocationKey}
              placeholder="peru|lima|miraflores"
              onChange={(event) =>
                onLocationKeyChange(event.target.value.toLowerCase())
              }
              disabled={disabled}
            />
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          {manualOverride
            ? "Manual key must be lowercase kebab-case segments."
            : `Built key: ${computedLocationKey || "(empty)"}`}
        </p>
        {keyError && (
          <p className="text-xs text-destructive">{keyError}</p>
        )}
      </div>
    </div>
  );
}
