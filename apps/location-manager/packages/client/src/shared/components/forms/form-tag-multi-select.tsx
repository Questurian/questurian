import * as React from "react";
import { type Control, type FieldValues, type Path } from "react-hook-form";
import { X } from "lucide-react";
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
import { FormBase } from "./form-base";

export interface TagSelectOption {
  value: string;
  label: string;
}

export interface TagSelectGroup {
  label: string;
  options: readonly TagSelectOption[];
}

export interface FormTagMultiSelectProps<T extends FieldValues = FieldValues> {
  name: Path<T>;
  label: string;
  control: Control<T>;
  options?: readonly TagSelectOption[];
  optionGroups?: readonly TagSelectGroup[];
  maxSelections?: number;
  placeholder?: string;
  description?: string;
  allowDirectTagArrayInput?: boolean;
}

interface ParsedTagInputSuccess {
  ok: true;
  tags: string[];
}

interface ParsedTagInputFailure {
  ok: false;
  error: string;
}

type ParsedTagInputResult = ParsedTagInputSuccess | ParsedTagInputFailure;

function normalizeTagText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function stripWrappingQuotes(value: string): string {
  return value.trim().replace(/^['"`]+|['"`]+$/g, "").trim();
}

function tokenizeTagInput(rawInput: string): string[] {
  const trimmed = rawInput.trim();

  if (!trimmed) {
    return [];
  }

  const withoutBrackets =
    trimmed.startsWith("[") && trimmed.endsWith("]")
      ? trimmed.slice(1, -1)
      : trimmed;

  return withoutBrackets
    .split(/[\n,;]+/)
    .map((token) => stripWrappingQuotes(token))
    .filter((token) => token.length > 0);
}

function buildNormalizedValueMap(options: readonly TagSelectOption[]): Map<string, string> {
  const normalizedValueMap = new Map<string, string>();

  options.forEach((option) => {
    normalizedValueMap.set(normalizeTagText(option.value), option.value);
    normalizedValueMap.set(normalizeTagText(option.label), option.value);
  });

  return normalizedValueMap;
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previousRow = Array.from({ length: b.length + 1 }, (_, index) => index);
  const currentRow = new Array<number>(b.length + 1).fill(0);

  for (let i = 0; i < a.length; i += 1) {
    currentRow[0] = i + 1;

    for (let j = 0; j < b.length; j += 1) {
      const cost = a[i] === b[j] ? 0 : 1;
      currentRow[j + 1] = Math.min(
        currentRow[j] + 1,
        previousRow[j + 1] + 1,
        previousRow[j] + cost
      );
    }

    for (let j = 0; j < previousRow.length; j += 1) {
      previousRow[j] = currentRow[j];
    }
  }

  return previousRow[b.length];
}

function getClosestTagSuggestion(token: string, optionValues: readonly string[]): string | null {
  const normalizedToken = normalizeTagText(token);
  let bestMatch: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  optionValues.forEach((option) => {
    const distance = levenshteinDistance(normalizedToken, normalizeTagText(option));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = option;
    }
  });

  const maxDistance = Math.max(2, Math.floor(normalizedToken.length * 0.35));

  return bestDistance <= maxDistance ? bestMatch : null;
}

function parseDirectTagArrayInput(params: {
  rawInput: string;
  maxSelections: number;
  normalizedValueMap: Map<string, string>;
  optionValues: readonly string[];
}): ParsedTagInputResult {
  const { rawInput, maxSelections, normalizedValueMap, optionValues } = params;
  const parsedTokens = tokenizeTagInput(rawInput);

  if (parsedTokens.length === 0) {
    return { ok: false, error: "Enter at least one tag before applying." };
  }

  const resolvedValues: string[] = [];
  const unknownTokens: string[] = [];

  parsedTokens.forEach((token) => {
    const normalizedToken = normalizeTagText(token);
    const resolvedValue = normalizedValueMap.get(normalizedToken);
    if (resolvedValue) {
      resolvedValues.push(resolvedValue);
    } else {
      unknownTokens.push(token);
    }
  });

  if (unknownTokens.length > 0) {
    const unknownTokenMessage = unknownTokens
      .map((token) => {
        const suggestion = getClosestTagSuggestion(token, optionValues);
        return suggestion
          ? `"${token}" (did you mean "${suggestion}"?)`
          : `"${token}"`;
      })
      .join(", ");
    return { ok: false, error: `Check spelling for: ${unknownTokenMessage}.` };
  }

  const duplicateValues = resolvedValues.filter(
    (value, index) => resolvedValues.indexOf(value) !== index
  );

  if (duplicateValues.length > 0) {
    const uniqueDuplicates = Array.from(new Set(duplicateValues));
    return { ok: false, error: `Remove duplicate tags: ${uniqueDuplicates.join(", ")}.` };
  }

  if (resolvedValues.length > maxSelections) {
    return {
      ok: false,
      error: `You can only apply up to ${maxSelections} tags at once.`,
    };
  }

  return {
    ok: true,
    tags: resolvedValues,
  };
}

function formatTagsAsArray(tags: readonly string[]): string {
  return `[${tags.map((tag) => `"${tag}"`).join(", ")}]`;
}

export function FormTagMultiSelect<T extends FieldValues = FieldValues>({
  name,
  label,
  control,
  options = [],
  optionGroups,
  maxSelections = 4,
  placeholder = "Select a tag",
  description,
  allowDirectTagArrayInput = false,
}: FormTagMultiSelectProps<T>) {
  const [isDirectArrayInputEnabled, setIsDirectArrayInputEnabled] = React.useState(false);
  const [directArrayInputValue, setDirectArrayInputValue] = React.useState("");
  const [directArrayInputError, setDirectArrayInputError] = React.useState<string | null>(null);
  const [directArrayInputFeedback, setDirectArrayInputFeedback] = React.useState<string | null>(null);

  return (
    <FormBase
      name={name}
      label={label}
      control={control}
      description={description}
    >
      {(field, fieldState) => {
        const selectedValues = Array.isArray(field.value)
          ? (field.value as string[])
          : [];
        const allOptions = optionGroups
          ? optionGroups.flatMap((group) => group.options)
          : options;
        const optionLabelByValue = new Map(
          allOptions.map((option) => [option.value, option.label])
        );
        const normalizedValueMap = buildNormalizedValueMap(allOptions);
        const optionValues = allOptions.map((option) => option.value);
        const availableOptions = allOptions.filter(
          (option) => !selectedValues.includes(option.value)
        );
        const availableOptionGroups = optionGroups?.map((group) => ({
          ...group,
          options: group.options.filter(
            (option) => !selectedValues.includes(option.value)
          ),
        })).filter((group) => group.options.length > 0);
        const isAtLimit = selectedValues.length >= maxSelections;

        const addTag = (nextValue: string) => {
          if (selectedValues.includes(nextValue) || isAtLimit) return;
          field.onChange([...selectedValues, nextValue]);
        };

        const removeTag = (valueToRemove: string) => {
          field.onChange(
            selectedValues.filter((value) => value !== valueToRemove)
          );
        };

        const handleDirectInputToggle = (isEnabled: boolean) => {
          setIsDirectArrayInputEnabled(isEnabled);
          setDirectArrayInputError(null);
          setDirectArrayInputFeedback(null);

          if (isEnabled && directArrayInputValue.trim().length === 0 && selectedValues.length > 0) {
            setDirectArrayInputValue(formatTagsAsArray(selectedValues));
          }
        };

        const handleApplyDirectInput = () => {
          const parseResult = parseDirectTagArrayInput({
            rawInput: directArrayInputValue,
            maxSelections,
            normalizedValueMap,
            optionValues,
          });

          if (!parseResult.ok) {
            setDirectArrayInputError(parseResult.error);
            setDirectArrayInputFeedback(null);
            return;
          }

          field.onChange(parseResult.tags);
          setDirectArrayInputValue(formatTagsAsArray(parseResult.tags));
          setDirectArrayInputError(null);
          setDirectArrayInputFeedback(
            `Applied ${parseResult.tags.length} tag${parseResult.tags.length === 1 ? "" : "s"}.`
          );
        };

        return (
          <div className="space-y-2">
            <Select
              key={selectedValues.join("|") || "empty"}
              value={undefined}
              onValueChange={addTag}
              disabled={
                (optionGroups
                  ? (availableOptionGroups?.length ?? 0) === 0
                  : availableOptions.length === 0) || isAtLimit
              }
            >
              <SelectTrigger
                id={field.name}
                onBlur={field.onBlur}
                aria-invalid={fieldState.invalid}
              >
                <SelectValue
                  placeholder={
                    isAtLimit
                      ? `Maximum ${maxSelections} tags selected`
                      : placeholder
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {optionGroups ? (
                  availableOptionGroups?.map((group, groupIndex) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel className="pl-2 pr-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                        {group.label}
                      </SelectLabel>
                      {group.options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                      {groupIndex < availableOptionGroups.length - 1 && (
                        <SelectSeparator />
                      )}
                    </SelectGroup>
                  ))
                ) : (
                  availableOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {allowDirectTagArrayInput && (
              <div className="rounded-md border border-dashed border-border/80 bg-muted/20 p-3 space-y-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={isDirectArrayInputEnabled}
                    onChange={(event) => handleDirectInputToggle(event.target.checked)}
                  />
                  Paste an Ideal For array directly
                </label>

                {isDirectArrayInputEnabled && (
                  <div className="space-y-2">
                    <Textarea
                      value={directArrayInputValue}
                      onChange={(event) => {
                        setDirectArrayInputValue(event.target.value);
                        setDirectArrayInputError(null);
                        setDirectArrayInputFeedback(null);
                      }}
                      rows={3}
                      placeholder='["Casual Dining", "Coffee & Light Bites"] or Casual Dining, Coffee & Light Bites'
                      aria-invalid={Boolean(directArrayInputError)}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] text-muted-foreground">
                        Brackets are optional. Tags must match the approved names exactly.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleApplyDirectInput}
                      >
                        Apply array
                      </Button>
                    </div>
                    {directArrayInputError && (
                      <p className="text-xs font-medium text-destructive">
                        {directArrayInputError}
                      </p>
                    )}
                    {directArrayInputFeedback && !directArrayInputError && (
                      <p className="text-xs font-medium text-green-600">
                        {directArrayInputFeedback}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {selectedValues.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedValues.map((value) => (
                  <span
                    key={value}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-foreground"
                  >
                    {optionLabelByValue.get(value) ?? value}
                    <button
                      type="button"
                      className="rounded-sm text-muted-foreground hover:text-foreground"
                      onClick={() => removeTag(value)}
                      aria-label={`Remove ${optionLabelByValue.get(value) ?? value}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {selectedValues.length}/{maxSelections} selected
            </p>
          </div>
        );
      }}
    </FormBase>
  );
}
