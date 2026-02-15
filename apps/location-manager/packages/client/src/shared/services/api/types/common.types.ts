export type Category = "dining" | "accommodations" | "attractions" | "nightlife";

export interface SuccessResponse {
  success: true;
  message?: string;
}

export interface TypeOption {
  label: string;
  value: string;
}
