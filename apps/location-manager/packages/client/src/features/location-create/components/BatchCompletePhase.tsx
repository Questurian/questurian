import { Check } from "lucide-react";
import { Button } from "@client/components/ui/button";
import type { BatchResult } from "./BatchUploadPhase";

interface BatchCompletePhaseProps {
  results: BatchResult[];
  onAddMore: () => void;
  onDone: () => void;
}

export function BatchCompletePhase({ results, onAddMore, onDone }: BatchCompletePhaseProps) {
  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div data-theme="light" className="w-full max-w-lg bg-background rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
            <Check className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-[24px]! opacity-70 font-medium text-foreground">Batch Upload Complete</h1>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4">
          <div className="p-4 bg-green-50 border border-green-200 rounded-md text-center">
            <p className="text-2xl font-semibold text-green-700">{successCount}</p>
            <p className="text-sm text-green-600">Successful</p>
          </div>
          {failedCount > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md text-center">
              <p className="text-2xl font-semibold text-red-700">{failedCount}</p>
              <p className="text-sm text-red-600">Failed</p>
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div className="mb-6 max-h-64 overflow-y-auto border rounded-md divide-y">
            {results.map((result, index) => (
              <div
                key={index}
                className={`p-3 flex items-start gap-3 ${result.success ? "bg-green-50" : "bg-red-50"}`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {result.success ? (
                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                      <span className="text-white text-xs">!</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">
                    {result.locationName || result.item.name || result.item.address}
                  </p>
                  {result.error && (
                    <p className="text-xs text-red-600">{result.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <Button onClick={onAddMore} variant="outline" className="flex-1">
            Add More
          </Button>
          <Button onClick={onDone} className="flex-1">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
