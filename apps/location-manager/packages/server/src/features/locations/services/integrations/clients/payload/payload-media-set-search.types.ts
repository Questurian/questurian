import type { PayloadMediaVariantType } from "./payload-media-set.types";

export interface PayloadMediaSetQueryResponse {
  docs: Array<{
    id: string;
    title: string;
    status: string;
    externalRef?: string;
  }>;
  totalDocs?: number;
}

export interface PayloadMediaSetSearchQueryDoc {
  id: string | number;
  title: string;
  alt_text?: string | null;
  photographer_credit?: string | null;
  status?: string | null;
  location?: string | null;
  locationRef?: unknown;
  updatedAt?: string | null;
  variants?: Partial<
    Record<
      PayloadMediaVariantType,
      | {
          id?: string | number;
          url?: string | null;
          alt_text?: string | null;
          updatedAt?: string | null;
        }
      | null
    >
  >;
}

export interface PayloadMediaSetSearchResponse {
  docs: PayloadMediaSetSearchQueryDoc[];
  totalDocs?: number;
  totalPages?: number;
  page?: number;
  limit?: number;
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
  nextPage?: number | null;
  prevPage?: number | null;
}

export interface PayloadMediaSetListItem {
  id: string;
  title: string;
  altText: string | null;
  photographerCredit: string | null;
  status: string | null;
  location: string | null;
  locationRef: string | null;
  previewUrl: string | null;
  updatedAt: string | null;
}

export interface PayloadMediaSetListResponse {
  docs: PayloadMediaSetListItem[];
  totalDocs: number;
  totalPages: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextPage: number | null;
  prevPage: number | null;
}
