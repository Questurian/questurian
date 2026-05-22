import type { Tour } from "../../models/location";

export type TourSourceProvider = "viator";

export interface ViatorProduct {
  provider: "viator";
  url: string;
  productCode: string | null;
  sourceTitle: string | null;
  description: string | null;
  duration: string | null;
  supplier: string | null;
  imageUrl: string | null;
  priceFrom: number | null;
  currency: string | null;
  rating: number | null;
  reviewCount: number | null;
}

export interface TourDraftPreview {
  provider: TourSourceProvider;
  sourceUrl: string;
  sourceProductCode: string | null;
  sourceTitle: string;
  sourceImageUrl: string | null;
  displayTitle: string;
  bookingLink: string;
  price: string;
  description: string | null;
  duration: string | null;
  supplier: string | null;
  rating: number | null;
  reviewCount: number | null;
  duplicateTour: Tour | null;
}

export interface TourImportErrorDetails {
  provider?: string;
  url?: string;
  cause?: string;
}
