import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { locationsApi } from "@client/shared/services/api";
import { LOCATION_BY_ID_QUERY_KEY } from "@client/shared/services/api/hooks/useLocationById";
import { Button } from "@client/components/ui/button";

interface PendingEntry {
  value: string | string[];
  provenance: string;
}

interface PendingSuggestionsPanelProps {
  locationId: number;
  category: string;
  pending: Record<string, PendingEntry> | null;
}

export function PendingSuggestionsPanel({
  locationId,
  category,
  pending,
}: PendingSuggestionsPanelProps) {
  const queryClient = useQueryClient();
  const [busyField, setBusyField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (category !== "dining") return null;
  if (!pending || Object.keys(pending).length === 0) return null;

  async function runAction(field: string, action: "accept" | "dismiss") {
    setError(null);
    setBusyField(field);
    try {
      if (action === "accept") {
        await locationsApi.acceptPendingSuggestion(locationId, field);
      } else {
        await locationsApi.dismissPendingSuggestion(locationId, field);
      }
      await queryClient.invalidateQueries({
        queryKey: LOCATION_BY_ID_QUERY_KEY(category, locationId),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyField(null);
    }
  }

  return (
    <section className="rounded-xl border border-dashed border-purple-400/40 bg-purple-400/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          AI suggestions waiting for your review
        </h2>
        <span className="text-xs text-muted-foreground">
          ({Object.keys(pending).length} pending)
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        These are AI re-suggestions that arrived after you'd already touched these fields. Accept
        to overwrite the live value (provenance flips back to AI), or dismiss to keep your value.
      </p>

      <ul className="divide-y divide-purple-400/20 rounded-md border border-purple-400/20 bg-background/40">
        {Object.entries(pending).map(([field, entry]) => (
          <li key={field} className="flex items-start justify-between gap-3 p-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{field}</span>
                <span className="rounded border border-purple-400/40 bg-purple-400/10 px-1 text-[10px] font-semibold tracking-wide text-purple-300">
                  AI
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Suggested: {Array.isArray(entry.value) ? entry.value.join(", ") : entry.value}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyField === field}
                onClick={() => void runAction(field, "dismiss")}
              >
                Dismiss
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busyField === field}
                onClick={() => void runAction(field, "accept")}
              >
                {busyField === field ? "Working…" : "Accept"}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          {error}
        </div>
      )}
    </section>
  );
}
