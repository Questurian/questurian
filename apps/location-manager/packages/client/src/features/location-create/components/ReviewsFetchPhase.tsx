import { useState, useEffect, useMemo } from "react";
import { AlertCircle, Check, MessageSquare, SkipForward } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { PipelineProgress, type PipelineStep } from "./PipelineProgress";
import { useLeadsApiHealth } from "@client/shared/services/api/hooks";
import { useFetchReviewsPipeline } from "@client/shared/services/api/hooks/useReviewsPipeline";
import type { Category, ReviewsPipelineJobStatus, ReviewSource } from "@client/shared/services/api/types";

interface ReviewsFetchPhaseProps {
  category: Category;
  locationId: number;
  locationName: string;
  tripadvisorUrl: string | null;
  placeId: string | null;
  onComplete: () => void;
  onSkip: () => void;
}

type PhaseState = "checking" | "ready" | "running" | "completed" | "failed" | "skipped";

export function ReviewsFetchPhase({
  category,
  locationId,
  locationName,
  tripadvisorUrl,
  placeId,
  onComplete,
  onSkip,
}: ReviewsFetchPhaseProps) {
  const [phaseState, setPhaseState] = useState<PhaseState>("checking");
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [tripadvisorEnabled, setTripadvisorEnabled] = useState(!!tripadvisorUrl);
  const [pipelineStatus, setPipelineStatus] = useState<ReviewsPipelineJobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasGooglePlaceId = !!placeId;
  const hasTripadvisorUrl = !!tripadvisorUrl;

  const {
    data: healthData,
    isLoading: isCheckingHealth,
    error: healthError,
  } = useLeadsApiHealth({ enabled: phaseState === "checking" });

  // Handle health check result
  useEffect(() => {
    if (phaseState !== "checking") return;

    if (healthError || (healthData && !healthData.healthy)) {
      setError(healthData?.error || healthError?.message || "Reviews API is not available");
      setPhaseState("failed");
      return;
    }

    if (healthData?.healthy) {
      setPhaseState("ready");
    }
  }, [healthData, healthError, phaseState]);

  const fetchReviewsPipeline = useFetchReviewsPipeline({
    category,
    locationId,
    onSuccess: () => {
      setPhaseState("completed");
    },
    onError: (error) => {
      setError(error.message);
      setPhaseState("failed");
    },
    onProgress: (status) => {
      setPipelineStatus(status);
    },
  });

  const handleStartFetch = () => {
    const sources: ReviewSource[] = [];
    if (googleEnabled) sources.push("google");
    if (tripadvisorEnabled) sources.push("tripadvisor");

    if (sources.length === 0) {
      onSkip();
      return;
    }

    setPhaseState("running");
    fetchReviewsPipeline.mutate({ sources });
  };

  const handleSkip = () => {
    setPhaseState("skipped");
    onSkip();
  };

  const handleComplete = () => {
    onComplete();
  };

  // Build pipeline steps from status
  const pipelineSteps = useMemo((): PipelineStep[] => {
    if (!pipelineStatus) {
      return [
        { label: "Checking health", status: "pending" },
        { label: "Fetching reviews", status: "pending" },
        { label: "Translating reviews", status: "pending" },
        { label: "Merging reviews", status: "pending" },
      ];
    }

    const { step, result } = pipelineStatus;

    const steps: PipelineStep[] = [
      {
        label: "Health check",
        status: "completed",
      },
    ];

    // Google fetching
    if (googleEnabled) {
      const isGoogleStep = step === "fetching_google";
      const isGoogleDone = step === "fetching_tripadvisor" || step === "translating_merging" || step === "completed";
      steps.push({
        label: "Fetching Google reviews",
        status: isGoogleStep ? "running" : isGoogleDone ? "completed" : "pending",
        detail: result?.fetched.google
          ? `${result.fetched.google.reviewCount} reviews`
          : undefined,
      });
    }

    // TripAdvisor fetching
    if (tripadvisorEnabled) {
      const isTripadvisorStep = step === "fetching_tripadvisor";
      const isTripadvisorDone = step === "translating_merging" || step === "completed";
      steps.push({
        label: "Fetching TripAdvisor reviews",
        status: isTripadvisorStep ? "running" : isTripadvisorDone ? "completed" : "pending",
        detail: result?.fetched.tripadvisor
          ? `${result.fetched.tripadvisor.totalReviews} reviews`
          : undefined,
      });
    }

    // Translating and merging
    const isMergingStep = step === "translating_merging";
    const isMergingDone = step === "completed";
    steps.push({
      label: "Translating & merging",
      status: isMergingStep ? "running" : isMergingDone ? "completed" : "pending",
      detail: result?.merged
        ? `${result.merged.stats.totalReviews} total reviews`
        : undefined,
    });

    return steps;
  }, [pipelineStatus, googleEnabled, tripadvisorEnabled]);

  // Checking health state
  if (phaseState === "checking" && isCheckingHealth) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl bg-card border border-border rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center animate-pulse">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-[24px]! opacity-70 font-medium text-foreground">Fetch Reviews</h1>
          </div>
          <p className="text-sm text-muted-foreground">Checking reviews API availability...</p>
        </div>
      </div>
    );
  }

  // Failed/unhealthy state
  if (phaseState === "failed") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl bg-card border border-border rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-[24px]! opacity-70 font-medium text-foreground">Reviews Unavailable</h1>
          </div>

          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-md">
            <p className="text-sm text-red-400">{error || "Unable to fetch reviews at this time."}</p>
          </div>

          <Button onClick={handleSkip} className="w-full" variant="outline">
            <SkipForward className="w-4 h-4 mr-2" />
            Skip Reviews
          </Button>
        </div>
      </div>
    );
  }

  // Ready state - source selection
  if (phaseState === "ready") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl bg-card border border-border rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-[24px]! opacity-70 font-medium text-foreground">Fetch Reviews</h1>
          </div>

          <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-md">
            <p className="text-sm text-blue-400">
              Fetch reviews for "{locationName}" from the following sources:
            </p>
          </div>

          <div className="space-y-4 mb-6">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={googleEnabled}
                onChange={(e) => setGoogleEnabled(e.target.checked)}
                disabled={!hasGooglePlaceId}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary disabled:opacity-50"
              />
              <span className={`text-sm ${!hasGooglePlaceId ? "text-muted-foreground" : ""}`}>
                Google Reviews
                {!hasGooglePlaceId && " (no Place ID)"}
              </span>
            </label>

            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={tripadvisorEnabled}
                onChange={(e) => setTripadvisorEnabled(e.target.checked)}
                disabled={!hasTripadvisorUrl}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary disabled:opacity-50"
              />
              <span className={`text-sm ${!hasTripadvisorUrl ? "text-muted-foreground" : ""}`}>
                TripAdvisor Reviews
                {!hasTripadvisorUrl && " (no TripAdvisor URL)"}
              </span>
            </label>
          </div>

          <div className="space-y-3">
            <Button
              onClick={handleStartFetch}
              disabled={!googleEnabled && !tripadvisorEnabled}
              className="w-full"
            >
              {googleEnabled || tripadvisorEnabled ? "Fetch Reviews" : "Select a Source"}
            </Button>

            <Button onClick={handleSkip} variant="outline" className="w-full">
              <SkipForward className="w-4 h-4 mr-2" />
              Skip
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Running state - show pipeline progress
  if (phaseState === "running") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl bg-card border border-border rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-[24px]! opacity-70 font-medium text-foreground">Fetching Reviews</h1>
          </div>

          <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-md">
            <p className="text-sm text-blue-400">
              {pipelineStatus?.message || "Starting reviews pipeline..."}
            </p>
          </div>

          <PipelineProgress steps={pipelineSteps} />

          {pipelineStatus?.warnings && pipelineStatus.warnings.length > 0 && (
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
              <p className="text-xs text-amber-400 font-medium mb-1">Warnings:</p>
              {pipelineStatus.warnings.map((warning, i) => (
                <p key={i} className="text-xs text-amber-400/80">
                  {warning.source}: {warning.message}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Completed state
  if (phaseState === "completed") {
    const stats = pipelineStatus?.result?.merged?.stats;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl bg-card border border-border rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
              <Check className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-[24px]! opacity-70 font-medium text-foreground">Reviews Fetched</h1>
          </div>

          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
            <p className="text-sm text-emerald-400">
              Successfully fetched {stats?.totalReviews || 0} reviews for "{locationName}"
            </p>
          </div>

          {stats && (
            <div className="mb-4 grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-muted rounded">
                <p className="text-lg font-semibold">{stats.totalReviews}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="p-2 bg-muted rounded">
                <p className="text-lg font-semibold">{stats.googleReviews}</p>
                <p className="text-xs text-muted-foreground">Google</p>
              </div>
              <div className="p-2 bg-muted rounded">
                <p className="text-lg font-semibold">{stats.tripadvisorReviews}</p>
                <p className="text-xs text-muted-foreground">TripAdvisor</p>
              </div>
            </div>
          )}

          <Button onClick={handleComplete} className="w-full">
            Continue
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
