import { useNavigate } from "react-router-dom";
import { useUpdateLocation } from "@client/shared/services/api";
import type { AddAccommodationsFormData } from "../../validation/add-accommodations.schema";
import { buildAccommodationsUpdatePayload } from "./build-accommodations-edit-payload";

interface UseUpdateAccommodationsParams {
  locationId: number | null;
}

/** Submits accommodations edits and navigates home on success. */
export function useUpdateAccommodations({ locationId }: UseUpdateAccommodationsParams) {
  const navigate = useNavigate();
  const { mutate: updateLocation, isPending, error } = useUpdateLocation();

  const handleSubmit = (data: AddAccommodationsFormData) => {
    if (!locationId) return;

    updateLocation(
      {
        category: "accommodations",
        id: locationId,
        data: buildAccommodationsUpdatePayload(data),
      },
      {
        onSuccess: () => navigate("/"),
      }
    );
  };

  return { handleSubmit, isPending, error };
}
