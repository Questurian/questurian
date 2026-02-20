export type Category = "dining" | "accommodations" | "attractions" | "nightlife" | "key_locations";

export interface SuccessResponse {
  success: true;
  message?: string;
}

export interface TypeOption {
  label: string;
  value: string;
}
