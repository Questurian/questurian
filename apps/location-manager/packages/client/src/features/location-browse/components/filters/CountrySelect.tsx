import { Globe } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@client/components/ui/select";
import { cn } from "@client/shared/lib/utils";
import type { Country } from "@client/shared/services/api/types";

interface CountrySelectProps {
  value: string | null;
  onChange: (value: string) => void;
  countries: Country[];
  isLoading?: boolean;
  triggerClassName?: string;
}

export function CountrySelect({ value, onChange, countries, isLoading, triggerClassName }: CountrySelectProps) {
  const hasValue = !!value;

  return (
    <Select value={value ?? ""} onValueChange={onChange} disabled={isLoading}>
      <SelectTrigger className={cn(triggerClassName, "w-auto")} data-has-value={hasValue || undefined}>
        <Globe className="h-3.5 w-3.5 shrink-0" />
        <SelectValue placeholder={isLoading ? "Loading..." : "Country"} />
      </SelectTrigger>
      <SelectContent>
        {countries.map(country => (
          <SelectItem key={country.code} value={country.code}>
            {country.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
