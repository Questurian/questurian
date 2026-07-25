import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { AddAttractionsFormData } from "../../validation/add-attractions.schema";
import type { AttractionsFormSection } from "./attractionsForm.types";

const SECTION_ORDER: AttractionsFormSection[] = [
  "step1",
  "entities",
  "profile",
  "tours",
  "visitContact",
];

const REQUIRED_FIELDS: Partial<
  Record<AttractionsFormSection, Array<keyof AddAttractionsFormData>>
> = {
  entities: ["placeId", "latitude", "longitude"],
  profile: ["type", "priceLevel", "bookingRequired"],
  tours: ["tourIds"],
  visitContact: ["hours"],
};

type Params = {
  form: UseFormReturn<AddAttractionsFormData>;
  isPrefillReady: boolean;
  onRunGooglePrefill: () => Promise<boolean>;
};

export function useAttractionsFormFlow({
  form,
  isPrefillReady,
  onRunGooglePrefill,
}: Params) {
  const [selectedSection, setSelectedSection] =
    useState<AttractionsFormSection>("step1");
  const [isAdvancing, setIsAdvancing] = useState(false);
  const activeSection =
    isPrefillReady || selectedSection === "step1" ? selectedSection : "step1";

  const hasValue = (value: string | undefined) =>
    Boolean(value && value.trim().length > 0);
  const flowSections = [
    { key: "step1", label: "Step 1", complete: isPrefillReady },
    {
      key: "entities",
      label: "Entities",
      complete:
        hasValue(form.watch("placeId")) &&
        hasValue(form.watch("latitude")) &&
        hasValue(form.watch("longitude")),
    },
    {
      key: "profile",
      label: "Profile",
      complete:
        hasValue(form.watch("type")) &&
        hasValue(form.watch("priceLevel")) &&
        hasValue(form.watch("bookingRequired")),
    },
    { key: "tours", label: "Tours", complete: true },
    {
      key: "visitContact",
      label: "Visit & Contact",
      complete: hasValue(form.watch("hours")),
    },
  ] satisfies Array<{
    key: AttractionsFormSection;
    label: string;
    complete: boolean;
  }>;

  const canOpenSection = (section: AttractionsFormSection) =>
    section === "step1" || isPrefillReady;

  const goToSection = (section: AttractionsFormSection) => {
    if (canOpenSection(section)) setSelectedSection(section);
  };

  const goToPreviousSection = () => {
    const currentIndex = SECTION_ORDER.indexOf(activeSection);
    const previousSection = SECTION_ORDER[currentIndex - 1];
    if (previousSection) goToSection(previousSection);
  };

  const goToNextSection = async () => {
    const currentIndex = SECTION_ORDER.indexOf(activeSection);
    const nextSection = SECTION_ORDER[currentIndex + 1];
    if (!nextSection) return;

    const fields = REQUIRED_FIELDS[activeSection];
    if (fields && !(await form.trigger(fields))) return;
    goToSection(nextSection);
  };

  const handleContinue = async () => {
    setIsAdvancing(true);
    if (await onRunGooglePrefill()) setSelectedSection("entities");
    setIsAdvancing(false);
  };

  return {
    activeSection,
    isAdvancing,
    flowSections,
    canOpenSection,
    goToSection,
    goToPreviousSection,
    goToNextSection,
    handleContinue,
  };
}
