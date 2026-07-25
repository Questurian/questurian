export type PayloadMediaVariantType =
  | "thumbnail"
  | "square"
  | "wide"
  | "open_graph"
  | "editorial"
  | "portrait"
  | "hero";

export interface PayloadMediaSetData {
  title: string;
  alt_text: string;
  photographer_credit?: string;
  externalRef?: string;
  location?: string;
  tags?: string[];
}

export interface PayloadMediaSetVariant {
  id: string;
  width: number;
  height: number;
}

export interface PayloadMediaSetResponse {
  message?: string;
  doc: {
    id: string;
    title: string;
    alt_text: string;
    status: "empty" | "partial" | "usable" | "complete";
    variants: Partial<Record<PayloadMediaVariantType, PayloadMediaSetVariant | null>>;
    externalRef?: string;
    location?: string;
    tags?: string[];
    createdAt?: string;
    updatedAt?: string;
  };
}

export interface PayloadMediaSetFromSourceResponse {
  mediaSetId: number;
  sourceAssetId: number;
  variantAssetIds: Partial<Record<PayloadMediaVariantType, number>>;
}

export interface PayloadVariantOverride {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PayloadMediaSetFromSourceData {
  title: string;
  alt_text?: string;
  photographer_credit?: string;
  location?: string;
  locationRef?: number;
  externalRef?: string;
  tags?: (string | number)[];
  focal_point?: { x: number; y: number };
  overrides?: Partial<Record<PayloadMediaVariantType, PayloadVariantOverride>>;
}
