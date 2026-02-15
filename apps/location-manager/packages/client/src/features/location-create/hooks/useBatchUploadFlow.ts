import { useState } from "react";
import { batchUploadSchema, type BatchItem } from "../validation/add-location.schema";
import type { BatchResult } from "../components/BatchUploadPhase";

export function useBatchUploadFlow(onPhaseChange: (phase: string) => void) {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [jsonInput, setJsonInput] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isJsonValid, setIsJsonValid] = useState(false);

  const validateJsonInput = (input: string) => {
    if (!input.trim()) {
      setJsonError(null);
      setIsJsonValid(false);
      return;
    }

    try {
      const parsed = JSON.parse(input);
      const result = batchUploadSchema.safeParse(parsed);
      if (!result.success) {
        const errorMessages = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
        setJsonError(`Validation error: ${errorMessages}`);
        setIsJsonValid(false);
        return;
      }
      setJsonError(null);
      setIsJsonValid(true);
    } catch {
      setJsonError("Invalid JSON format. Please check your input.");
      setIsJsonValid(false);
    }
  };

  const handleJsonChange = (value: string) => {
    setJsonInput(value);
    validateJsonInput(value);
  };

  const handleStartUpload = () => {
    if (!isJsonValid) return;

    try {
      const parsed = JSON.parse(jsonInput);
      const result = batchUploadSchema.safeParse(parsed);
      if (result.success) {
        setItems(result.data);
        onPhaseChange("batch-processing");
      }
    } catch {
      // Already validated
    }
  };

  const handleComplete = (batchResults: BatchResult[]) => {
    setResults(batchResults);
    onPhaseChange("batch-complete");
  };

  const handleCancel = () => {
    onPhaseChange("add");
    resetBatch();
  };

  const resetBatch = () => {
    setItems([]);
    setResults([]);
    setJsonInput("");
    setJsonError(null);
    setIsJsonValid(false);
  };

  const handleReset = () => {
    onPhaseChange("add");
    resetBatch();
  };

  return {
    items,
    results,
    jsonInput,
    jsonError,
    isJsonValid,
    handleJsonChange,
    handleStartUpload,
    handleComplete,
    handleCancel,
    handleReset,
  };
}
