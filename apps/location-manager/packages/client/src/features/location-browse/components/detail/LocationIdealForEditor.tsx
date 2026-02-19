import { useEffect, useState } from "react";
import type { LocationResponse } from "@client/shared/services/api/types";
import { getIdealForGroups } from "@shared/types/location-ideal-for";
import {
  Button,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@client/components/ui";
import { X } from "lucide-react";
import { useToast } from "@client/shared/hooks/useToast";
import { useUpdateLocation } from "@client/shared/services/api/hooks/useUpdateLocation";
import {
  MAX_IDEAL_FOR_SELECTIONS,
  parseIdealForDirectInput,
  formatTagsAsArray,
} from "../../utils/ideal-for-utils";

interface LocationIdealForEditorProps {
  locationDetail: LocationResponse;
}

export function LocationIdealForEditor({ locationDetail }: LocationIdealForEditorProps) {
  const { showToast } = useToast();
  const { mutate: updateLocation, isPending: isUpdatingLocation } = useUpdateLocation();

  const hasIdealFor = Boolean(
    Array.isArray(locationDetail?.idealFor) && locationDetail.idealFor.length > 0
  );

  const [idealForDraft, setIdealForDraft] = useState<string[]>([]);
  const [isDirectInputEnabled, setIsDirectInputEnabled] = useState(false);
  const [directInputValue, setDirectInputValue] = useState("");
  const [directInputError, setDirectInputError] = useState<string | null>(null);
  const [directInputFeedback, setDirectInputFeedback] = useState<string | null>(null);

  useEffect(() => {
    setIdealForDraft([]);
    setIsDirectInputEnabled(false);
    setDirectInputValue("");
    setDirectInputError(null);
    setDirectInputFeedback(null);
  }, [locationDetail?.id, hasIdealFor]);

  const addIdealForTag = (tag: string) => {
    if (isUpdatingLocation) return;

    setIdealForDraft((prev) => {
      if (prev.includes(tag) || prev.length >= MAX_IDEAL_FOR_SELECTIONS) return prev;
      return [...prev, tag];
    });
    setDirectInputError(null);
    setDirectInputFeedback(null);
  };

  const removeIdealForTag = (tagToRemove: string) => {
    setIdealForDraft((prev) => prev.filter((tag) => tag !== tagToRemove));
    setDirectInputError(null);
    setDirectInputFeedback(null);
  };

  const handleDirectInputToggle = (isEnabled: boolean) => {
    setIsDirectInputEnabled(isEnabled);
    setDirectInputError(null);
    setDirectInputFeedback(null);

    if (isEnabled && directInputValue.trim().length === 0 && idealForDraft.length > 0) {
      setDirectInputValue(formatTagsAsArray(idealForDraft));
    }
  };

  const handleApplyDirectInput = () => {
    const parseResult = parseIdealForDirectInput(locationDetail.category, directInputValue);

    if (!parseResult.ok) {
      setDirectInputError(parseResult.error);
      setDirectInputFeedback(null);
      return;
    }

    setIdealForDraft(parseResult.tags);
    setDirectInputValue(formatTagsAsArray(parseResult.tags));
    setDirectInputError(null);
    setDirectInputFeedback(
      `Applied ${parseResult.tags.length} tag${parseResult.tags.length === 1 ? "" : "s"}.`
    );
  };

  const submitIdealForTags = () => {
    if (!locationDetail || isUpdatingLocation || idealForDraft.length === 0) return;

    updateLocation(
      {
        category: locationDetail.category,
        id: locationDetail.id,
        data: { idealFor: idealForDraft },
      },
      {
        onSuccess: () => {
          const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
          showToast("Ideal For tags saved", centerPosition);
        },
        onError: (updateError) => {
          const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
          showToast(updateError.message || "Failed to save Ideal For tags", centerPosition);
        },
      }
    );
  };

  const availableIdealForGroups = getIdealForGroups(locationDetail.category).map((group) => ({
    ...group,
    tags: group.tags.filter((tag) => !idealForDraft.includes(tag)),
  })).filter((group) => group.tags.length > 0);

  if (hasIdealFor) return null;

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
      <span className="text-sm font-medium text-foreground">Set Ideal For</span>
      <Select
        key={`${isUpdatingLocation ? "updating" : "ready"}-${idealForDraft.join("|") || "empty"}`}
        value={undefined}
        onValueChange={addIdealForTag}
        disabled={
          isUpdatingLocation ||
          idealForDraft.length >= MAX_IDEAL_FOR_SELECTIONS ||
          availableIdealForGroups.length === 0
        }
      >
        <SelectTrigger className="h-9">
          <SelectValue
            placeholder={
              isUpdatingLocation
                ? "Saving..."
                : idealForDraft.length >= MAX_IDEAL_FOR_SELECTIONS
                  ? `Maximum ${MAX_IDEAL_FOR_SELECTIONS} tags selected`
                  : "Choose tags (1-4)"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {availableIdealForGroups.map((group, groupIndex) => (
            <SelectGroup key={group.label}>
              <SelectLabel className="pl-2 pr-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                {group.label}
              </SelectLabel>
              {group.tags.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                </SelectItem>
              ))}
              {groupIndex < availableIdealForGroups.length - 1 && <SelectSeparator />}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      <div className="rounded-md border border-dashed border-border/80 bg-background/60 p-3 space-y-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-primary"
            checked={isDirectInputEnabled}
            onChange={(event) => handleDirectInputToggle(event.target.checked)}
          />
          Paste an Ideal For array directly
        </label>

        {isDirectInputEnabled && (
          <div className="space-y-2">
            <Textarea
              value={directInputValue}
              onChange={(event) => {
                setDirectInputValue(event.target.value);
                setDirectInputError(null);
                setDirectInputFeedback(null);
              }}
              rows={3}
              placeholder='["Casual Dining", "Coffee & Light Bites"] or Casual Dining, Coffee & Light Bites'
              aria-invalid={Boolean(directInputError)}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                Brackets are optional. Tags must match the approved names exactly.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleApplyDirectInput}
                disabled={isUpdatingLocation}
              >
                Apply array
              </Button>
            </div>
            {directInputError && (
              <p className="text-xs font-medium text-destructive">
                {directInputError}
              </p>
            )}
            {directInputFeedback && !directInputError && (
              <p className="text-xs font-medium text-green-600">
                {directInputFeedback}
              </p>
            )}
          </div>
        )}
      </div>

      {idealForDraft.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {idealForDraft.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground"
            >
              {tag}
              <button
                type="button"
                className="rounded-sm text-muted-foreground hover:text-foreground"
                onClick={() => removeIdealForTag(tag)}
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={submitIdealForTags}
          disabled={isUpdatingLocation || idealForDraft.length === 0}
        >
          {isUpdatingLocation ? "Saving..." : "Set Ideal For"}
        </Button>
        {idealForDraft.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIdealForDraft([])}
            disabled={isUpdatingLocation}
          >
            Clear
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {idealForDraft.length}/{MAX_IDEAL_FOR_SELECTIONS} selected. This appears only when no Ideal For tag is set.
      </p>
    </div>
  );
}
