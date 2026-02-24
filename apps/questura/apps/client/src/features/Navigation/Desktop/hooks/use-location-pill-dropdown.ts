"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocationStore } from "@/lib/stores/locationStore";
import { useIntentModalStore } from "@/lib/stores/intentModalStore";
import {
  getCountriesFromCities,
  getCountryCities,
  getSameCountryCities,
} from "../services/desktop-navbar-location.service";
import type { CountryInfo, DropdownView } from "../types";

interface UseLocationPillDropdownArgs {
  currentCityId?: string;
  currentCountry?: string;
}

export function useLocationPillDropdown({
  currentCityId,
  currentCountry,
}: UseLocationPillDropdownArgs) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<DropdownView>("main");
  const [selectedCountry, setSelectedCountry] = useState<CountryInfo | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const getCityMode = useLocationStore((state) => state.getCityMode);
  const openIntentModal = useIntentModalStore((state) => state.openIntentModal);

  const sameCountryCities = useMemo(
    () => getSameCountryCities(currentCountry, currentCityId),
    [currentCountry, currentCityId]
  );
  const countries = useMemo(() => getCountriesFromCities(), []);
  const countryCities = useMemo(
    () => getCountryCities(selectedCountry?.slug),
    [selectedCountry?.slug]
  );

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 8, left: rect.left });
  }, []);

  useEffect(() => {
    if (!isOpen || !contentRef.current) return;
    const el = contentRef.current;
    const observer = new ResizeObserver(([entry]) => {
      setContentHeight(entry.contentRect.height);
    });
    observer.observe(el);
    setContentHeight(el.scrollHeight);
    return () => observer.disconnect();
  }, [isOpen, view]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => updatePosition();

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  const handleToggle = () => {
    if (!isOpen) {
      updatePosition();
      setView("main");
      setSelectedCountry(null);
    }
    setIsOpen((prev) => !prev);
  };

  const handleCityClick = (city: (typeof sameCountryCities)[number]) => {
    setIsOpen(false);
    const savedMode = getCityMode(city.id, city.country);
    if (savedMode) {
      router.push(`/${city.country}/${city.id}/${savedMode}`);
      return;
    }

    openIntentModal(city.id, city.country, city.name);
  };

  const handleCountryClick = (country: CountryInfo) => {
    setSelectedCountry(country);
    setView("country-cities");
  };

  return {
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
  };
}
