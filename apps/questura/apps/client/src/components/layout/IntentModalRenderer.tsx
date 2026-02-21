"use client";

import { useRouter } from "next/navigation";
import { useIntentModalStore } from "@/lib/stores/intentModalStore";
import { useLocationStore } from "@/lib/stores/locationStore";
import IntentModal from "@/components/layout/IntentModal";

export default function IntentModalRenderer() {
  const router = useRouter();
  const { isOpen, cityId, country, cityName, closeIntentModal } = useIntentModalStore();
  const setCityMode = useLocationStore((state) => state.setCityMode);

  const handleSelect = (mode: string) => {
    if (!cityId || !country) return;
    setCityMode(cityId, country, mode);
    closeIntentModal();
    router.push(`/${country}/${cityId}/${mode}`);
  };

  return (
    <IntentModal
      isOpen={isOpen}
      cityName={cityName}
      onSelect={handleSelect}
      onClose={closeIntentModal}
    />
  );
}
