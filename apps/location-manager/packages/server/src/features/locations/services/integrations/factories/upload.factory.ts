import type { ImageSetUpload, Upload } from "../../../models/location";

export function createFromUpload(
  locationId: number,
  photographerCredit?: string | null
): Upload {
  return {
    location_id: locationId,
    imageSet: undefined,
    format: "imageset",
  };
}

export function createFromImageSetUpload(locationId: number): ImageSetUpload {
  return {
    location_id: locationId,
    imageSet: undefined,
    format: "imageset",
  };
}
