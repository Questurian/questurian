import { useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Sparkles, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@client/components/ui/dialog";
import { Button } from "@client/components/ui/button";
import type {
  AiFieldStatus,
  AiSuggestionFieldKey,
} from "../hooks/useAddDiningFlow";

interface AiStatusBadgeProps {
  fieldKey: AiSuggestionFieldKey;
  fieldLabel: string;
  status: AiFieldStatus | undefined;
  onRetry: (fieldKey: AiSuggestionFieldKey) => Promise<void> | void;
}

interface BadgeStyle {
  icon: typeof Sparkles;
  text: string;
  className: string;
}

const BADGE_STYLES: Record<
  Exclude<AiFieldStatus["state"], "idle">,
  BadgeStyle
> = {
  running: {
    icon: Loader2,
    text: "AI…",
    className: "border-slate-400/40 bg-slate-400/10 text-slate-300",
  },
  suggested: {
    icon: CheckCircle2,
    text: "AI",
    className: "border-purple-400/40 bg-purple-400/10 text-purple-300",
  },
  "no-result": {
    icon: AlertTriangle,
    text: "AI: no result",
    className: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  },
  error: {
    icon: XCircle,
    text: "AI: error",
    className: "border-rose-400/40 bg-rose-400/10 text-rose-300",
  },
};

export function AiStatusBadge({ fieldKey, fieldLabel, status, onRetry }: AiStatusBadgeProps) {
  const [open, setOpen] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  if (!status || status.state === "idle") return null;

  const style = BADGE_STYLES[status.state];
  const Icon = style.icon;
  const isRunning = status.state === "running";

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRetry(fieldKey);
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => !isRunning && setOpen(true)}
        disabled={isRunning}
        title={`${fieldLabel} — click for AI suggestion details`}
        className={`inline-flex h-4 items-center gap-1 rounded border px-1 text-[10px] font-semibold leading-none tracking-wide transition-opacity hover:opacity-80 disabled:cursor-default disabled:opacity-100 ${style.className}`}
      >
        <Icon className={`h-3 w-3 ${isRunning ? "animate-spin" : ""}`} />
        <span>{style.text}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-400" />
              {status.state === "suggested"
                ? `${fieldLabel} — AI suggestion`
                : `Why no ${fieldLabel}?`}
            </DialogTitle>
            <DialogDescription>
              {status.state === "suggested" && "AI returned a value above the confidence threshold."}
              {status.state === "no-result" &&
                "AI returned nothing usable — either confidence was too low or the suggestion didn't match an allowed value / URL."}
              {status.state === "error" &&
                "The AI call failed before returning a suggestion."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {typeof status.confidence === "number" && (
              <div className="flex items-center justify-between rounded border border-border/60 bg-muted/30 px-3 py-2">
                <span className="text-muted-foreground">Confidence</span>
                <span
                  className={`font-mono ${
                    status.confidence >= status.confidenceThreshold
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }`}
                >
                  {status.confidence.toFixed(2)} / {status.confidenceThreshold.toFixed(2)}
                </span>
              </div>
            )}

            {status.errorMessage && (
              <div className="rounded border border-rose-500/30 bg-rose-500/5 p-3 text-rose-300">
                {status.errorMessage}
              </div>
            )}

            {status.reason && (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Reason
                </div>
                <p className="text-foreground/90">{status.reason}</p>
              </div>
            )}

            {status.sources && status.sources.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Sources
                </div>
                <ul className="space-y-2">
                  {status.sources.map((source, index) => (
                    <li
                      key={`${source.url ?? source.label}-${index}`}
                      className="rounded border border-border/60 bg-muted/20 p-2"
                    >
                      {source.url ? (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 text-sky-300 hover:underline"
                        >
                          {source.label || source.url}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-foreground/90">{source.label}</span>
                      )}
                      {source.snippet && (
                        <p className="mt-1 text-xs text-muted-foreground">{source.snippet}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              type="button"
              onClick={() => void handleRetry()}
              disabled={isRetrying}
              className="gap-2"
            >
              {isRetrying && <Loader2 className="h-4 w-4 animate-spin" />}
              {isRetrying ? "Retrying…" : "Retry this field"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
