import { useEffect, useState } from "react";
import { locationsApi } from "@client/shared/services/api";
import type { DiningStage2SuggestionResult } from "@client/shared/services/api/types";
import { Button } from "@client/components/ui/button";

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-2xl rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          AI re-suggestion
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Running AI suggestions for Type and Ideal For against the merged reviews. Anything you
          already touched will land in the edit page as a pending suggestion you can accept or
          dismiss later.
        </p>

        <div className="mt-6 space-y-3">
          {status === "running" && (
            <div className="rounded-md border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground">
              Working…
            </div>
          )}

          {status === "error" && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {errorMessage ?? "Unknown error"}
            </div>
          )}

          {status === "done" && result && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Reviews used: {result.reviewsUsed ? "yes" : "no (fallback to Google grounding)"}
              </div>
              <ul className="divide-y divide-border/60 rounded-md border border-border/60">
                {result.outcomes.map((outcome) => (
                  <li key={outcome.field} className="flex items-start justify-between gap-4 p-3 text-sm">
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
        </div>

        <div className="mt-6 flex justify-between">
          <Button type="button" variant="outline" onClick={onSkip}>
            Skip
          </Button>
          <Button type="button" onClick={onComplete} disabled={status === "running"}>
            {status === "running" ? "Working…" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
