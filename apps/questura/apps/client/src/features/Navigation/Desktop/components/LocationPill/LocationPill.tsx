"use client";

import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import type { LocationPillProps } from "../../types";
import { useLocationPillDropdown } from "../../hooks/use-location-pill-dropdown";
import { FlagImage } from "./FlagImage";
import { LocationPillMenu } from "./LocationPillMenu";

export function LocationPill({
  cityName,
  countryName,
  countryCode,
  currentCityId,
  currentCountry,
}: LocationPillProps) {
  const locationLabel = `${cityName}, ${countryName}`;

  const {
    isOpen,
    view,
    selectedCountry,
    dropdownPos,
    contentHeight,
    sameCountryCities,
    countries,
    countryCities,
    triggerRef,
    dropdownRef,
    contentRef,
    setIsOpen,
    setView,
    handleToggle,
    handleCityClick,
    handleCountryClick,
  } = useLocationPillDropdown({
    currentCityId,
    currentCountry,
  });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex items-center gap-1.5 text-white/95 hover:text-white transition-colors"
        aria-label={`Current location: ${locationLabel}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={handleToggle}
      >
        <span className="inline-flex h-3 w-4.5 overflow-hidden rounded-[2px] border border-white/35 bg-white/10">
          {countryCode ? (
            <FlagImage code={countryCode} alt={`${countryName} flag`} />
          ) : (
            <span className="h-full w-full bg-white/30" />
          )}
        </span>
        <span className="text-[0.78rem] font-medium tracking-[0.02em]">{locationLabel}</span>
        <ChevronDown
          className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen
        ? createPortal(
            <div
              ref={dropdownRef}
              role="menu"
              className="fixed z-9999 w-56 overflow-hidden rounded-md border border-white/15 bg-[#2d2f33] shadow-lg transition-[height] duration-150 ease-out"
              style={{
                top: dropdownPos.top,
                left: dropdownPos.left,
                height: contentHeight !== undefined ? contentHeight : "auto",
              }}
            >
              <div ref={contentRef}>
                <LocationPillMenu
                  view={view}
                  sameCountryCities={sameCountryCities}
                  countries={countries}
                  countryCities={countryCities}
                  selectedCountry={selectedCountry}
                  currentCityId={currentCityId}
                  currentCountry={currentCountry}
                  setView={setView}
                  onCityClick={handleCityClick}
                  onCountryClick={handleCountryClick}
                  onClose={() => setIsOpen(false)}
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
