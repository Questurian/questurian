import { useEffect, useState } from "react";
import type { Path, PathValue, UseFormReturn, FieldValues } from "react-hook-form";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Button } from "@client/components/ui/button";
import { locationsApi } from "@client/shared/services/api";

interface BookingUrlSuggestRowProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  category: "attractions" | "nightlife";
  label: string;
  fieldName: Path<T>;
  /** Called with the current acknowledgment state. Parent uses this to gate
   *  Create. Defaults to acknowledged when no AI suggestion is present. */
  onAckChange?: (acked: boolean) => void;
}

/**
 * Per ADR-0009: per-field Suggest UI for attractions/nightlife bookingUrl.
 * - Click Suggest → POST /api/field-suggestions, fill the field, mark AI.
 * - AI-supplied URL requires "I verified" before Create unblocks.
 * - Operator editing the field clears the AI flag (provenance flips to operator).
 */
export function BookingUrlSuggestRow<T extends FieldValues>({
  form,
  category,
  label,
  fieldName,
  onAckChange,
}: BookingUrlSuggestRowProps<T>) {
  const [aiSuggested, setAiSuggested] = useState(false);
  const [verified, setVerified] = useState(true);
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const acked = !aiSuggested || verified || !form.watch(fieldName);

  useEffect(() => {
    onAckChange?.(acked);
  }, [acked, onAckChange]);

  async function handleSuggest() {
    setStatus({ kind: "busy" });
    try {
      const response = await locationsApi.suggestField({
        category,
        fieldKey: "bookingUrl",
        formValues: form.getValues() as Record<string, unknown>,
      });
      if (!response.suggestion || typeof response.suggestion !== "string") {
        setStatus({
          kind: "error",
          message: response.error || "No usable suggestion returned.",
        });
        return;
      }
      form.setValue(fieldName, response.suggestion as PathValue<T, Path<T>>, {
        shouldDirty: false,
        shouldValidate: true,
      });
      setAiSuggested(true);
      setVerified(false);
      setStatus({ kind: "idle" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Suggest failed",
      });
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label>{label} (optional)</Label>
        {aiSuggested && (
          <span className="inline-flex items-center rounded-sm border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase leading-none tracking-normal text-sky-500">
            AI suggested
          </span>
        )}
      </div>
      <Input
        placeholder="https://example.com/tickets"
        {...form.register(fieldName, {
          onChange: () => {
            if (aiSuggested) {
              setAiSuggested(false);
              setVerified(true);
            }
          },
        })}
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void handleSuggest()}
          disabled={status.kind === "busy"}
        >
          {status.kind === "busy" ? "Suggesting…" : "Suggest with AI"}
        </Button>
        {aiSuggested && Boolean(form.watch(fieldName)) && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={verified}
              onChange={(event) => setVerified(event.target.checked)}
            />
            I verified this URL works.
          </label>
        )}
      </div>
      {status.kind === "error" && (
        <p className="text-xs text-destructive">{status.message}</p>
      )}
    </div>
  );
}
