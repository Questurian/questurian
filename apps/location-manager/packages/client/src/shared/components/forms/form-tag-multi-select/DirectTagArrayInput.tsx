import * as React from "react";
import { Button, Textarea } from "@client/components/ui";
import type { TagSelectOption } from "../form-tag-multi-select.types";
import {
  formatTagsAsArray,
  parseDirectTagArrayInput,
} from "./tag-input-parser";

interface DirectTagArrayInputProps {
  selectedValues: string[];
  options: readonly TagSelectOption[];
  maxSelections: number;
  onApply: (tags: string[]) => void;
}

export function DirectTagArrayInput({
  selectedValues,
  options,
  maxSelections,
  onApply,
}: DirectTagArrayInputProps) {
  const [isEnabled, setIsEnabled] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<string | null>(null);

  const handleToggle = (nextEnabled: boolean) => {
    setIsEnabled(nextEnabled);
    setError(null);
    setFeedback(null);
    if (nextEnabled && !inputValue.trim() && selectedValues.length > 0) {
      setInputValue(formatTagsAsArray(selectedValues));
    }
  };

  const handleApply = () => {
    const result = parseDirectTagArrayInput({
      rawInput: inputValue,
      maxSelections,
      options,
    });
    if (!result.ok) {
      setError(result.error);
      setFeedback(null);
      return;
    }

    onApply(result.tags);
    setInputValue(formatTagsAsArray(result.tags));
    setError(null);
    setFeedback(
      `Applied ${result.tags.length} tag${result.tags.length === 1 ? "" : "s"}.`
    );
  };

  return (
    <div className="rounded-md border border-dashed border-border/80 bg-muted/20 p-3 space-y-3">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-primary"
          checked={isEnabled}
          onChange={(event) => handleToggle(event.target.checked)}
        />
        Paste an Ideal For array directly
      </label>

      {isEnabled && (
        <div className="space-y-2">
          <Textarea
            value={inputValue}
            onChange={(event) => {
              setInputValue(event.target.value);
              setError(null);
              setFeedback(null);
            }}
            rows={3}
            placeholder='["Casual Dining", "Coffee & Light Bites"] or Casual Dining, Coffee & Light Bites'
            aria-invalid={Boolean(error)}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              Brackets are optional. Tags must match the approved names exactly.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleApply}
            >
              Apply array
            </Button>
          </div>
          {error && (
            <p className="text-xs font-medium text-destructive">{error}</p>
          )}
          {feedback && !error && (
            <p className="text-xs font-medium text-green-600">{feedback}</p>
          )}
        </div>
      )}
    </div>
  );
}
