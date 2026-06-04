import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { locationsApi } from "@client/shared/services/api";
import { LOCATION_BY_ID_QUERY_KEY } from "@client/shared/services/api/hooks/useLocationById";

export type BookingSuggestState =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "error"; message: string };

export function useNightlifeEditSuggestions(locationId: number | null) {
  const queryClient = useQueryClient();
  const [bookingSuggestState, setBookingSuggestState] = useState<BookingSuggestState>({ status: "idle" });

  const handleBookingUrlSuggest = async () => {
    if (!locationId) return;
    setBookingSuggestState({ status: "busy" });
    try {
      await locationsApi.proposePendingSuggestion(locationId, "bookingUrl");
      await queryClient.invalidateQueries({
        queryKey: LOCATION_BY_ID_QUERY_KEY("nightlife", locationId),
      });
      setBookingSuggestState({ status: "idle" });
    } catch (err) {
      setBookingSuggestState({
        status: "error",
        message: err instanceof Error ? err.message : "Suggest failed",
      });
    }
  };

  return { bookingSuggestState, handleBookingUrlSuggest };
}
