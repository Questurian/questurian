import { useState, useEffect, useRef } from "react";
import { Check, X, Loader2, Upload, AlertCircle } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { locationsApi } from "@client/shared/services/api/locations.api";
import type { BatchItem } from "../validation/add-location.schema";
import type { BatchResult } from "../types/location-create.types";

export type { BatchResult };

interface BatchUploadPhaseProps {
  items: BatchItem[];
  onComplete: (results: BatchResult[]) => void;
  onCancel: () => void;
}

type ItemStatus = "pending" | "creating" | "confirming" | "completed" | "failed";

interface ItemState {
  status: ItemStatus;
  message: string;
  locationId?: number;
  locationName?: string;
  error?: string;
}

export function BatchUploadPhase({
  items,
  onComplete,
  onCancel,
}: BatchUploadPhaseProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [itemStates, setItemStates] = useState<ItemState[]>(
    items.map(() => ({ status: "pending", message: "Waiting..." }))
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const pausedRef = useRef(false);
  const processingRef = useRef(false);

  // Sync ref with state
  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  const updateItemState = (index: number, state: Partial<ItemState>) => {
    setItemStates((prev) => {
      const newStates = [...prev];
      newStates[index] = { ...newStates[index], ...state };
      return newStates;
    });
  };

  const processItem = async (index: number): Promise<BatchResult> => {
    const item = items[index];

    // Update to creating status
    updateItemState(index, {
      status: "creating",
      message: `Creating location from address: ${item.address.substring(0, 50)}${item.address.length > 50 ? "..." : ""}`,
    });

    try {
      // Step 1: Create location
      const createResponse = await locationsApi.createLocation({
        name: item.name || item.address, // Use address as name if not provided
        address: item.address,
        category: item.category,
        idealFor: item.idealFor,
        type: item.type,
        tripadvisorUrl: item.tripadvisorUrl,
      });

      const locationId = createResponse.id;
      const locationName = createResponse.title || createResponse.source.name;

      // Update to confirming status
      updateItemState(index, {
        status: "confirming",
        message: `Auto-confirming details for: ${locationName}`,
        locationId,
        locationName,
      });

      // Step 2: Auto-confirm with default values (skip manual confirmation)
      await locationsApi.updateLocation(item.category, locationId, {
        title: locationName,
        phoneNumber: createResponse.contact?.phoneNumber || undefined,
        website: createResponse.contact?.website || undefined,
      });

      // Step 3: Skip reviews - mark as completed
      updateItemState(index, {
        status: "completed",
        message: `Successfully added: ${locationName}`,
        locationId,
        locationName,
      });

      return {
        index,
        item,
        success: true,
        locationId,
        locationName,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      updateItemState(index, {
        status: "failed",
        message: `Failed: ${errorMessage}`,
        error: errorMessage,
      });

      return {
        index,
        item,
        success: false,
        error: errorMessage,
      };
    }
  };

  const processAllItems = async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);

    const results: BatchResult[] = [];

    for (let i = currentIndex; i < items.length; i++) {
      // Check if paused
      while (pausedRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      setCurrentIndex(i);
      const result = await processItem(i);
      results.push(result);

      // Small delay between items to prevent rate limiting
      if (i < items.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    setIsProcessing(false);
    processingRef.current = false;
    onComplete(results);
  };

  // Start processing on mount
  useEffect(() => {
    processAllItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completedCount = itemStates.filter((s) => s.status === "completed").length;
  const failedCount = itemStates.filter((s) => s.status === "failed").length;
  const progressPercent = Math.round(((completedCount + failedCount) / items.length) * 100);

  const handlePauseResume = () => {
    setIsPaused((prev) => !prev);
  };

  const handleCancel = () => {
    pausedRef.current = true;
    setIsPaused(true);
    onCancel();
  };

  const currentItem = items[currentIndex];
  const currentState = itemStates[currentIndex];

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-lg bg-card border border-border rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
            <Upload className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-[24px]! opacity-70 font-medium text-foreground">
            Batch Upload
          </h1>
        </div>

        {/* Progress indicator */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-foreground">
              Progress: {completedCount + failedCount}/{items.length}
            </span>
            <span className="text-sm text-muted-foreground">{progressPercent}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span className="text-emerald-400">{completedCount} completed</span>
            {failedCount > 0 && <span className="text-red-400">{failedCount} failed</span>}
          </div>
        </div>

        {/* Current item status */}
        {isProcessing && currentItem && (
          <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-md">
            <div className="flex items-start gap-3">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-blue-400 mb-1">
                  Processing item {currentIndex + 1} of {items.length}
                </p>
                <p className="text-xs text-blue-400/80 truncate">
                  {currentState?.message || "Processing..."}
                </p>
                {currentItem.name && (
                  <p className="text-xs text-blue-400/70 mt-1">
                    Name: {currentItem.name}
                  </p>
                )}
                <p className="text-xs text-blue-400/70 truncate">
                  Address: {currentItem.address}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Items list with scroll */}
        <div className="mb-4">
          <p className="text-sm font-medium text-foreground mb-2">Items</p>
          <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
            {items.map((item, index) => {
              const state = itemStates[index];
              return (
                <div
                  key={index}
                  className={`p-3 flex items-start gap-3 ${
                    index === currentIndex && isProcessing
                      ? "bg-blue-500/5"
                      : state.status === "completed"
                        ? "bg-emerald-500/5"
                        : state.status === "failed"
                          ? "bg-red-500/5"
                          : ""
                  }`}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {state.status === "pending" && (
                      <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
                    )}
                    {(state.status === "creating" || state.status === "confirming") && (
                      <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                    )}
                    {state.status === "completed" && (
                      <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                    {state.status === "failed" && (
                      <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                        <X className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        #{index + 1}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {item.category}
                      </span>
                    </div>
                    <p className="text-sm text-foreground truncate mt-0.5">
                      {state.locationName || item.name || item.address}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {state.message}
                    </p>
                    {state.error && (
                      <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {state.error}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          {isProcessing ? (
            <>
              <Button
                onClick={handlePauseResume}
                variant="outline"
                className="flex-1"
              >
                {isPaused ? "Resume" : "Pause"}
              </Button>
              <Button
                onClick={handleCancel}
                variant="destructive"
                className="flex-1"
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              onClick={() => onComplete([])}
              className="flex-1"
            >
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
