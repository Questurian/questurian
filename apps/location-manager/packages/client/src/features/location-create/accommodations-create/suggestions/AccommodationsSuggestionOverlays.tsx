import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@client/components/ui/button";
import type { AccommodationsFieldSuggestionResponse } from "@client/shared/services/api/types";
import type {
  AiSuggestedField,
  AiSuggestionEvidence,
  AutoFillProgress,
} from "../accommodations-create.types";
import {
  formatSuggestionValue,
  getSuggestionField,
  getSuggestionFieldOptions,
} from "./accommodations-suggestion-utils";

export function AutoFillProgressOverlay({ progress }: { progress: AutoFillProgress | null }) {
  if (!progress) return null;

  const percent =
    progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sky-500/15 text-sky-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Filling accommodations fields</h2>
            <p className="text-sm text-muted-foreground">
              Filling {progress.completed}/{progress.total} fields
            </p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-sky-500 transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>{progress.currentFieldLabel || "Preparing suggestions"}</span>
          <span>
            {progress.applied} applied, {progress.failed} need review
          </span>
        </div>
      </div>
    </div>
  );
}

export function AutoFillEvidencePanel({ evidence }: { evidence: AiSuggestionEvidence }) {
  const entries = Object.entries(evidence) as Array<
    [AiSuggestedField, AccommodationsFieldSuggestionResponse]
  >;
  if (entries.length === 0) return null;

  return (
    <div className="rounded-md border border-sky-500/30 bg-sky-500/10 p-3 text-sm">
      <div className="font-medium text-sky-300">AI-filled field evidence</div>
      <div className="mt-2 space-y-2">
        {entries.map(([fieldKey, item]) => {
          const field = getSuggestionField(fieldKey);
          return (
            <details key={fieldKey} className="rounded-md border border-sky-500/20 bg-background/60 p-2">
              <summary className="cursor-pointer text-xs font-medium text-foreground">
                {field?.label || item.fieldLabel || fieldKey}
                {item.error ? " needs review" : `: ${formatSuggestionValue(item.suggestion, getSuggestionFieldOptions(fieldKey, []))}`}
              </summary>
              {item.reason && (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.reason}</p>
              )}
              {item.sources.length > 0 && (
                <div className="mt-2 space-y-1">
                  {item.sources.map((source, index) => (
                    <div key={`${source.label}-${index}`} className="text-xs text-muted-foreground">
                      {source.url ? (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          {source.label}
                        </a>
                      ) : (
                        <span className="font-medium text-foreground">{source.label}</span>
                      )}
                      {source.snippet && <p className="mt-0.5 leading-relaxed">{source.snippet}</p>}
                    </div>
                  ))}
                </div>
              )}
              {item.error && <p className="mt-2 text-xs text-destructive">{item.error}</p>}
            </details>
          );
        })}
      </div>
    </div>
  );
}

export function SuggestionStackOverlay({
  stack,
  locationTypes,
  pendingCount,
  onApply,
  onDismiss,
}: {
  stack: AccommodationsFieldSuggestionResponse[];
  locationTypes: Array<{ value: string; label: string }>;
  pendingCount: number;
  onApply: (item: AccommodationsFieldSuggestionResponse) => void;
  onDismiss: (item: AccommodationsFieldSuggestionResponse) => void;
}) {
  if (stack.length === 0) return null;

  const top = stack[stack.length - 1];
  const backgroundDepth = Math.min(stack.length - 1, 2);
  const topOptions = getSuggestionFieldOptions(top.fieldKey as AiSuggestedField, locationTypes);
  const topValue = formatSuggestionValue(top.suggestion, topOptions);
  const canApply = Boolean(top.suggestion && !top.error);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-xl">
        {Array.from({ length: backgroundDepth }).map((_, i) => {
          const depth = backgroundDepth - i;
          return (
            <div
              key={i}
              className="absolute inset-0 rounded-lg border border-border bg-card"
              style={{
                transform: `translate(${depth * 8}px, ${depth * 8}px)`,
                zIndex: i,
                opacity: 1 - depth * 0.2,
              }}
            />
          );
        })}

        <div
          className="relative rounded-lg border border-border bg-card shadow-2xl"
          style={{ zIndex: backgroundDepth + 1 }}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky-400" />
              <span className="font-semibold text-foreground">
                {top.fieldLabel || top.fieldKey}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {stack.length > 1 && (
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {stack.length - 1} more ready
                </span>
              )}
              {pendingCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {pendingCount} fetching
                </span>
              )}
            </div>
          </div>

          <div className="space-y-4 p-5 text-sm">
            <div className="rounded-md border border-border bg-muted/25 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Proposed value
              </div>
              <div className="mt-1 text-base font-semibold text-foreground">{topValue || "—"}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Confidence
                </div>
                <div className="mt-1 text-foreground">{Math.round(top.confidence * 100)}%</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Evidence
                </div>
                <div className="mt-1 text-foreground">
                  {top.source === "existing-data" ? "Google/Foursquare" : "Gemini research"}
                </div>
              </div>
            </div>
            {top.reason && (
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Reason
                </div>
                <p className="mt-1 leading-relaxed text-foreground">{top.reason}</p>
              </div>
            )}
            {top.sources && top.sources.length > 0 && (
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Sources
                </div>
                <div className="mt-2 space-y-2">
                  {top.sources.map((source, idx) => (
                    <div key={`${source.label}-${idx}`} className="rounded-md border border-border p-2">
                      {source.url ? (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          {source.label}
                        </a>
                      ) : (
                        <div className="font-medium text-foreground">{source.label}</div>
                      )}
                      {source.snippet && (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {source.snippet}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {top.error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                {top.error}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <Button type="button" variant="outline" onClick={() => onDismiss(top)}>
              Dismiss
            </Button>
            <Button type="button" disabled={!canApply} onClick={() => onApply(top)}>
              Apply suggestion
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
