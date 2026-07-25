import { useCallback, useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { AddDiningFormData } from "../../validation/add-dining.schema";
import type { PhotoImportSessionState } from "../PhotoImportPhase";
import type { DiningFormSection } from "./add-dining-staged-form.types";

interface UseDiningFormSectionsOptions {
  form: UseFormReturn<AddDiningFormData>;
  photoImportEnabled: boolean;
  isPrefillReady: boolean;
  onRunGooglePrefill: () => Promise<boolean>;
}

const REVIEW_FIELDS: Array<keyof AddDiningFormData> = [
  "placeId",
  "latitude",
  "longitude",
  "idealFor",
  "type",
  "tripadvisorUrl",
  "menuUrl",
  "bookingUrl",
  "title",
  "phoneNumber",
  "website",
];

const SECTIONS_WITH_PHOTOS: DiningFormSection[] = ["step1", "review", "photos"];
const SECTIONS_WITHOUT_PHOTOS: DiningFormSection[] = ["step1", "review"];

function hasValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export function useDiningFormSections({
  form,
  photoImportEnabled,
  isPrefillReady,
  onRunGooglePrefill,
}: UseDiningFormSectionsOptions) {
  const [activeSection, setActiveSection] = useState<DiningFormSection>("step1");
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [photoSession, setPhotoSession] = useState<PhotoImportSessionState | null>(null);
  const photoReady = photoSession?.ready ?? false;
  const photoCount = photoSession?.cropped.length ?? 0;
  const selectedCount = photoSession?.selected.length ?? 0;
  const sectionOrder = photoImportEnabled
    ? SECTIONS_WITH_PHOTOS
    : SECTIONS_WITHOUT_PHOTOS;

  const reviewComplete =
    hasValue(form.watch("placeId")) &&
    hasValue(form.watch("latitude")) &&
    hasValue(form.watch("longitude")) &&
    (form.watch("idealFor")?.length ?? 0) > 0 &&
    !form.formState.errors.tripadvisorUrl &&
    !form.formState.errors.menuUrl &&
    !form.formState.errors.bookingUrl &&
    !form.formState.errors.title &&
    !form.formState.errors.phoneNumber &&
    !form.formState.errors.website;

  const sections = [
    { key: "step1" as const, label: "Basics", complete: isPrefillReady },
    { key: "review" as const, label: "Review", complete: reviewComplete },
    ...(photoImportEnabled
      ? [{ key: "photos" as const, label: "Photos", complete: photoReady || selectedCount === 0 }]
      : []),
  ];

  const canOpenSection = useCallback((section: DiningFormSection) => (
    section === "step1" || isPrefillReady
  ), [isPrefillReady]);

  const goToSection = useCallback((section: DiningFormSection) => {
    if (canOpenSection(section)) setActiveSection(section);
  }, [canOpenSection]);

  const goToPreviousSection = useCallback(() => {
    const previous = sectionOrder[sectionOrder.indexOf(activeSection) - 1];
    if (previous) goToSection(previous);
  }, [activeSection, goToSection, sectionOrder]);

  const goToNextSection = useCallback(async () => {
    const next = sectionOrder[sectionOrder.indexOf(activeSection) + 1];
    if (!next) return;
    if (activeSection === "review" && !(await form.trigger(REVIEW_FIELDS))) return;
    goToSection(next);
  }, [activeSection, form, goToSection, sectionOrder]);

  useEffect(() => {
    if (isPrefillReady || activeSection === "step1") return;
    queueMicrotask(() => setActiveSection("step1"));
  }, [activeSection, isPrefillReady]);

  useEffect(() => {
    if (photoImportEnabled || activeSection !== "photos") return;
    queueMicrotask(() => setActiveSection("review"));
  }, [activeSection, photoImportEnabled]);

  const continueFromBasics = useCallback(async () => {
    setIsAdvancing(true);
    const success = await onRunGooglePrefill();
    if (success) setActiveSection("review");
    setIsAdvancing(false);
  }, [onRunGooglePrefill]);

  return {
    activeSection,
    sections,
    canOpenSection,
    goToSection,
    goToPreviousSection,
    goToNextSection,
    continueFromBasics,
    isAdvancing,
    photoSession,
    setPhotoSession,
    photoReady,
    photoCount,
    selectedCount,
  };
}
