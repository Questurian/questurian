import { updateLocationById } from "../../../repositories/core";

export function touchLocationUpdatedAt(locationId: number): void {
  updateLocationById(locationId, {
    updated_at: new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, ""),
  });
}
