import type { BatchItem } from "../validation/add-location.schema";

export type Phase = "add" | "confirm" | "reviews" | "success" | "batch-input" | "batch-processing" | "batch-complete";

export interface BatchResult {
  index: number;
  item: BatchItem;
  success: boolean;
  locationId?: number;
  locationName?: string;
  error?: string;
}

export interface PipelineStep {
  label: string;
  status: "pending" | "running" | "completed" | "failed";
  detail?: string;
}
