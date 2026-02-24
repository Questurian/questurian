import Link from "next/link";
import { ArrowLeft, ChevronRight, Compass } from "lucide-react";
import type { CountryInfo, DropdownView } from "../../types";
import { FlagImage } from "./FlagImage";
import { cities } from "@/features/CityDiscovery/lib/data";

type CityRecord = (typeof cities)[number];

interface LocationPillMenuProps {
  view: DropdownView;
  sameCountryCities: CityRecord[];
  countries: CountryInfo[];
  countryCities: CityRecord[];
  selectedCountry: CountryInfo | null;
  currentCityId?: string;
  currentCountry?: string;
  setView: (view: DropdownView) => void;
  onCityClick: (city: CityRecord) => void;
  onCountryClick: (country: CountryInfo) => void;
  onClose: () => void;
}

export function LocationPillMenu({
  view,
  sameCountryCities,
  countries,
  countryCities,
  selectedCountry,
  currentCityId,
  currentCountry,
  setView,
  onCityClick,
  onCountryClick,
  onClose,
}: LocationPillMenuProps) {
  const renderCityList = (cityList: CityRecord[]) => (
    <>
      {cityList.map((city) => {
        const isCurrent = city.id === currentCityId && city.country === currentCountry;

        return (
          <button
            key={city.id}
            type="button"
            role="menuitem"
            className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-sm transition-colors ${
              isCurrent
                ? "bg-white/10 text-white"
                : "text-white/75 hover:bg-white/10 hover:text-white"
            }`}
            onClick={() => onCityClick(city)}
          >
            <span className="inline-flex h-3 w-4.5 shrink-0 overflow-hidden rounded-[2px] border border-white/25 bg-white/10">
              <FlagImage code={city.countryCode} alt={`${city.displayCountry} flag`} />
            </span>
            <span className="flex-1 truncate">{city.name}</span>
          </button>
        );
      })}
    </>
  );

  switch (view) {
    case "main":
      return (
        <>
          <div className="p-1.5">
            {sameCountryCities.length > 0 ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10"
                onClick={() => setView("cities")}
              >
                Change City
                <ChevronRight className="h-3.5 w-3.5 text-white/40" />
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10"
              onClick={() => setView("countries")}
            >
              Change Country
              <ChevronRight className="h-3.5 w-3.5 text-white/40" />
            </button>
          </div>

          <div className="border-t border-white/10 p-1.5">
            <Link
              href="/?browse"
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10"
              onClick={onClose}
            >
              <Compass className="h-3.5 w-3.5 text-white/50" />
              Explore all cities
            </Link>
          </div>
        </>
      );

    case "cities":
      return (
        <>
          <div className="border-b border-white/10 p-1.5">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-white/50 hover:bg-white/10 hover:text-white/80"
              onClick={() => setView("main")}
            >
              <ArrowLeft className="h-3 w-3" />
              Back
            </button>
          </div>
          <div className="p-1.5">{renderCityList(sameCountryCities)}</div>
        </>
      );

    case "countries":
      return (
        <>
          <div className="border-b border-white/10 p-1.5">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-white/50 hover:bg-white/10 hover:text-white/80"
              onClick={() => setView("main")}
            >
              <ArrowLeft className="h-3 w-3" />
              Back
            </button>
          </div>
          <div className="p-1.5">
            {countries.map((country) => {
              const isCurrent = country.slug === currentCountry;

              return (
                <button
                  key={country.slug}
                  type="button"
                  role="menuitem"
                  className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-sm transition-colors ${
                    isCurrent
                      ? "bg-white/10 text-white"
                      : "text-white/75 hover:bg-white/10 hover:text-white"
                  }`}
                  onClick={() => onCountryClick(country)}
                >
                  <span className="inline-flex h-3 w-4.5 shrink-0 overflow-hidden rounded-[2px] border border-white/25 bg-white/10">
                    <FlagImage code={country.countryCode} alt={`${country.name} flag`} />
                  </span>
                  <span className="flex-1 truncate">{country.name}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-white/40" />
                </button>
              );
            })}
          </div>
        </>
      );

    case "country-cities":
      return (
        <>
          <div className="border-b border-white/10 p-1.5">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-white/50 hover:bg-white/10 hover:text-white/80"
              onClick={() => setView("countries")}
            >
              <ArrowLeft className="h-3 w-3" />
              {selectedCountry?.name}
            </button>
          </div>
          <div className="p-1.5">{renderCityList(countryCities)}</div>
        </>
      );
  }
}
