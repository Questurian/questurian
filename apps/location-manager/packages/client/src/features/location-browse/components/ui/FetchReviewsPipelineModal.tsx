import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@client/components/ui/dialog";
import { Button } from "@client/components/ui/button";
import { Loader2 } from "lucide-react";
import type { FetchReviewsPipelineRequest } from "@client/shared/services/api/types";

interface FetchReviewsPipelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFetch: (params: FetchReviewsPipelineRequest) => void;
  isPending: boolean;
  statusMessage?: string | null;
  locationName?: string;
  googleAvailable?: boolean;
  tripadvisorAvailable?: boolean;
}

export function FetchReviewsPipelineModal({
  isOpen,
  onClose,
  onFetch,
  isPending,
  statusMessage,
  locationName,
  googleAvailable = true,
  tripadvisorAvailable = true,
}: FetchReviewsPipelineModalProps) {
  const [sources, setSources] = useState({
    google: false,
    tripadvisor: true,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const defaultTripadvisor = Boolean(tripadvisorAvailable);
    const defaultGoogle = !defaultTripadvisor && Boolean(googleAvailable);
    setSources({
      google: defaultGoogle,
      tripadvisor: defaultTripadvisor,
    });
    setError(null);
  }, [isOpen, googleAvailable, tripadvisorAvailable]);

  const selectedSources = useMemo(() => {
    const selected: FetchReviewsPipelineRequest["sources"] = [];
    if (sources.google) selected.push("google");
    if (sources.tripadvisor) selected.push("tripadvisor");
    return selected;
  }, [sources]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedSources.length === 0) {
      setError("Select at least one source.");
      return;
    }
    setError(null);
    onFetch({ sources: selectedSources });
  }

  function handleToggle(source: "google" | "tripadvisor") {
    setSources((prev) => ({
      ...prev,
      [source]: !prev[source],
    }));
  }

  function handleClose() {
    if (isPending) return;
    onClose();
  }

  const googleDisabled = !googleAvailable;
  const tripadvisorDisabled = !tripadvisorAvailable;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className="sm:max-w-[500px]"
        onPointerDownOutside={(e) => isPending && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Fetch Reviews</DialogTitle>
          <DialogDescription>
            {locationName
              ? `Fetch reviews for "${locationName}" and build the merged dataset.`
              : "Fetch reviews and build the merged dataset."}
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <div className="py-8 space-y-4">
            <div className="flex flex-col items-center justify-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
              <div className="text-center">
                <p className="text-lg font-medium text-foreground">Running review pipeline...</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Fetching, translating, and merging reviews. This may take a few minutes.
                </p>
                {statusMessage && (
                  <p className="text-sm text-blue-600 mt-2">{statusMessage}</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Which sources do you want to use?</p>
              <div className="space-y-2">
                <label className={`flex items-center gap-2 text-sm ${googleDisabled ? "opacity-50" : ""}`}>
                  <input
                    type="checkbox"
                    checked={sources.google}
                    disabled={googleDisabled}
                    onChange={() => handleToggle("google")}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span>Google</span>
                  {googleDisabled && (
                    <span className="text-xs text-muted-foreground">(Google Place ID required)</span>
                  )}
                </label>
                <label className={`flex items-center gap-2 text-sm ${tripadvisorDisabled ? "opacity-50" : ""}`}>
                  <input
                    type="checkbox"
                    checked={sources.tripadvisor}
                    disabled={tripadvisorDisabled}
                    onChange={() => handleToggle("tripadvisor")}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span>TripAdvisor</span>
                  <span className="text-xs text-muted-foreground">(default)</span>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                TripAdvisor is selected by default since Google API quota is currently exhausted.
              </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending || selectedSources.length === 0}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isPending ? "Fetching..." : "Fetch Reviews"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
