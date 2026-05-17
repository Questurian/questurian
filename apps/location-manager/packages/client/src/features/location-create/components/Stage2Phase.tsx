import { useEffect, useState } from "react";
import { AlertCircle, Check, Sparkles } from "lucide-react";
import { locationsApi } from "@client/shared/services/api";
import type { DiningStage2SuggestionResult } from "@client/shared/services/api/types";
import { Button } from "@client/components/ui/button";
import { ProcessingCard } from "./ProcessingCard";

interface Stage2PhaseProps {
  locationId: number;
  onComplete: () => void;
  onSkip: () => void;
}

type Status = "running" | "done" | "error";

export function Stage2Phase({ locationId, onComplete, onSkip }: Stage2PhaseProps) {
  const [status, setStatus] = useState<Status>("running");
  const [result, setResult] = useState<DiningStage2SuggestionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    locationsApi
      .runDiningStage2Suggest(locationId)
      .then((data) => {
        if (cancelled) return;
        setResult(data);
        setStatus("done");
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Stage 2 suggestion failed");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  const iconBg =
    status === "done" ? "bg-green-500" : status === "error" ? "bg-red-500" : "bg-blue-500";
  const HeaderIcon = status === "done" ? Check : status === "error" ? AlertCircle : Sparkles;
  const heading =
    status === "done"
      ? "AI Re-Suggestion Ready"
      : status === "error"
        ? "AI Re-Suggestion Failed"
        : "AI Re-Suggestion";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="flex items-center gap-2.5 mb-6">
          <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
            <HeaderIcon className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{heading}</h1>
        </div>

        {status === "running" && (
          <ProcessingCard
            icon={Sparkles}
            title="Re-suggesting Type & Ideal For"
            subtitle="Using the reviews we just fetched to refine your earlier picks. Takes about 10 seconds."
          />
        )}

        {status === "error" && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {errorMessage ?? "Unknown error"}
          </div>
        )}

        {status === "done" && result && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {result.reviewsUsed
                ? "Suggestions generated from the merged reviews."
                : "No reviews available — fell back to Google grounding."}
            </p>
            <ul className="divide-y divide-border/60 rounded-md border border-border/60 overflow-hidden">
              {result.outcomes.map((outcome) => (
                <li
                  key={outcome.field}
                  className="flex items-start justify-between gap-4 p-3 text-sm"
                >
                  <div>
                    <div className="font-medium text-foreground">{outcome.field}</div>
                    <div className="text-xs text-muted-foreground">
                      {outcome.applied === "live" && (
                        <>Written to live value ({outcome.provenance})</>
                      )}
                      {outcome.applied === "pending" && (
                        <>Saved as pending suggestion ({outcome.provenance}) — review on edit page</>
                      )}
                      {outcome.applied === "skipped" && <>Skipped — {outcome.reason}</>}
                    </div>
                    {outcome.value && (
                      <div className="mt-1 text-xs text-muted-foreground/80">
                        {Array.isArray(outcome.value) ? outcome.value.join(", ") : outcome.value}
                      </div>
                    )}
                  </div>
                  {typeof outcome.confidence === "number" && (
                    <span className="text-xs text-muted-foreground">
                      {(outcome.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <Button type="button" variant="outline" onClick={onSkip}>
            Skip
          </Button>
          <Button type="button" onClick={onComplete} disabled={status === "running"}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
