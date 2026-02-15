import type { ImageVariantType } from "@questurian/lm-shared";
import type { IdealForTag } from "@shared/types/location-ideal-for";
import type { Area } from "react-easy-crop";

// Image processing types
export interface CropData {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TargetDimensions {
  width: number;
  height: number;
}

export interface CropState {
  variantType: ImageVariantType;
  crop: { x: number; y: number };
  zoom: number;
  croppedAreaPixels: Area | null;
  completed: boolean;
}

// Ideal-for input parsing types
interface ParsedIdealForInputSuccess {
  ok: true;
  tags: IdealForTag[];
}

interface ParsedIdealForInputFailure {
  ok: false;
  error: string;
}

export type ParsedIdealForInputResult = ParsedIdealForInputSuccess | ParsedIdealForInputFailure;
