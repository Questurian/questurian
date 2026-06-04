import type { Tour, TourDraftPreview } from "@client/shared/services/api/types";
import type { ImageVariantUploadFile } from "@client/shared/types/location-media.types";

export interface TourDraft {
  title: string;
  imgPayloadMediaSetId: string;
  bookingLink: string;
  price: string;
  locationKey: string;
  sourceProvider: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceImageUrl: string;
  sourceProductCode: string;
}

export interface TourFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tour?: Tour | null;
  importDraft?: TourDraftPreview | null;
  /** When creating, prefill the locationKey selects (operator can still edit). */
  prefilledLocationKey?: string | null;
  /** Fires after a new Tour is created. Receives the saved Tour. */
  onCreated?: (tour: Tour) => void;
}

export interface ProcessedTourImageSet {
  sourceFile: File;
  variantFiles: ImageVariantUploadFile[];
  altText?: string;
}

export const EMPTY_TOUR_DRAFT: TourDraft = {
  title: "",
  imgPayloadMediaSetId: "",
  bookingLink: "",
  price: "",
  locationKey: "",
  sourceProvider: "",
  sourceUrl: "",
  sourceTitle: "",
  sourceImageUrl: "",
  sourceProductCode: "",
};

export function tourToDraft(tour: Tour): TourDraft {
  return {
    title: tour.title,
    imgPayloadMediaSetId: tour.imgPayloadMediaSetId,
    bookingLink: tour.bookingLink,
    price: tour.price,
    locationKey: tour.locationKey?.trim() ?? "",
    sourceProvider: tour.sourceProvider ?? "",
    sourceUrl: tour.sourceUrl ?? "",
    sourceTitle: tour.sourceTitle ?? "",
    sourceImageUrl: tour.sourceImageUrl ?? "",
    sourceProductCode: tour.sourceProductCode ?? "",
  };
}

export function importDraftToDraft(importDraft: TourDraftPreview): TourDraft {
  return {
    title: importDraft.displayTitle,
    imgPayloadMediaSetId: "",
    bookingLink: importDraft.bookingLink,
    price: importDraft.price,
    locationKey: "",
    sourceProvider: importDraft.provider,
    sourceUrl: importDraft.sourceUrl,
    sourceTitle: importDraft.sourceTitle,
    sourceImageUrl: importDraft.sourceImageUrl ?? "",
    sourceProductCode: importDraft.sourceProductCode ?? "",
  };
}

export function isAbsoluteUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function formatMissingFields(fields: string[]) {
  if (fields.length === 1) return fields[0];
  if (fields.length === 2) return fields.join(" and ");
  return `${fields.slice(0, -1).join(", ")}, and ${fields[fields.length - 1]}`;
}
