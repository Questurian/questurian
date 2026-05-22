import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router-dom";
import { BedDouble, CheckCircle2, ChevronLeft, Loader2, Sparkles } from "lucide-react";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Button } from "@client/components/ui/button";
import { locationsApi } from "@client/shared/services/api";
import { useCreateLocation } from "@client/shared/services/api/hooks";
import { PhotoImportPhase, type PhotoImportSessionState } from "../components/PhotoImportPhase";
import { addFlowPhotoSession } from "../lib/add-flow-photo-session";
import { useLocationTypes } from "@client/shared/services/api/hooks/useLocationTypes";
import type {
  AccommodationsFieldSuggestionResponse,
  GooglePrefillResponse,
} from "@client/shared/services/api/types";
import { buildAccommodationsDetails } from "@client/shared/lib/accommodations-details";
import {
  addAccommodationsSchema,
  addAccommodationsSubmitSchema,
  buildAccommodationsPrefillSignature,
  normalizeAccommodationsAddress,
  type AddAccommodationsFormData,
} from "../validation/add-accommodations.schema";
import {
  isAccommodationOptionSuggestionEligible,
  optionValueIsEmpty,
  optionValueMatchesDefault,
} from "../utils/accommodations-ai-suggestions";
import {
  BOOLEAN_OPTIONS,
  ACCOMMODATIONS_SUGGESTION_FIELDS,
  CHECK_IN_TIME_OPTIONS,
  CHECK_OUT_TIME_OPTIONS,
  GYM_OPTIONS,
  JACUZZI_OPTIONS,
  PARKING_OPTIONS,
  PARKING_VALUES,
  PERFECT_FOR_OPTIONS,
  PERFECT_FOR_VALUES,
  POOL_OPTIONS,
  POOL_VALUES,
  PRICE_OPTIONS,
  PRICE_VALUES,
  type AccommodationsOption,
  type AccommodationsSuggestionFieldKey,
  VIBE_OPTIONS,
  WALKABILITY_OPTIONS,
  WORKSPACE_OPTIONS,
} from "../constants/accommodations-options";

type AccommodationsFormSection =
  | "step1"
  | "entities"
  | "core"
  | "stay"
  | "experience"
  | "details"
  | "photos";

type MultiField = "perfectFor" | "parking" | "vibe" | "workspace" | "pool" | "jacuzzi";
type AiSuggestedField = AccommodationsSuggestionFieldKey;

type ApiFilledField =
  | "googleUrl"
  | "googleMapsUrl"
  | "placeId"
  | "latitude"
  | "longitude"
  | "locationKey"
  | "district"
  | "ianaTimeId"
  | "phone"
  | "websiteUrl"
  | "price"
  | "perfectFor"
  | "ac"
  | "wifi"
  | "parking"
  | "pool";

interface OptionSelectProps {
  label: string;
  options: AccommodationsOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  apiFilled?: boolean;
  aiSuggested?: boolean;
  manuallySelected?: boolean;
  canSuggest?: boolean;
  isSuggesting?: boolean;
  onSuggest?: () => void;
}

interface MultiOptionTableProps {
  label: string;
  options: AccommodationsOption[];
  values: string[];
  onToggle: (value: string) => void;
  error?: string;
  apiFilled?: boolean;
  aiSuggested?: boolean;
  manuallySelected?: boolean;
  canSuggest?: boolean;
  isSuggesting?: boolean;
  onSuggest?: () => void;
}

interface SectionHeaderProps {
  title: string;
  isComplete?: boolean;
  canSuggestAll?: boolean;
  isSuggestingAll?: boolean;
  onSuggestAll?: () => void;
}

interface AccommodationsDraftPayload {
  formValues: AddAccommodationsFormData;
  prefillSignature: string | null;
}

interface AutoFillProgress {
  total: number;
  completed: number;
  applied: number;
  failed: number;
  currentFieldLabel: string | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

const ACCOMMODATIONS_DRAFT_STORAGE_KEY = "lm:add-accommodations:draft:v1";
const AUTO_FILL_CONCURRENCY = 3;
const ACCOMMODATIONS_SECTION_ORDER: AccommodationsFormSection[] = [
  "step1",
  "entities",
  "core",
  "stay",
  "experience",
  "details",
  "photos",
];

const ACCOMMODATIONS_FORM_DEFAULT_VALUES = {
  name: "",
  title: "",
  address: "",
  type: "",
  price: "",
  perfectFor: [],
  kidFriendly: "",
  ac: "",
  wifi: "",
  extraGuestFee: "",
  parking: [],
  breakfastServed: "",
  vibe: [],
  workspace: [],
  restaurant: "",
  pool: [],
  rooftopLounge: "",
  jacuzzi: [],
  gym: "",
  walkability: "",
  checkInTime: "",
  checkOutTime: "",
  phone: "",
  websiteUrl: "",
  bookingUrl: "",
  googleMapsUrl: "",
  googleUrl: "",
  placeId: "",
  latitude: "",
  longitude: "",
  locationKey: "",
  district: "",
  ianaTimeId: "",
} as unknown as AddAccommodationsFormData;

function isDraftEffectivelyEmpty(payload: AccommodationsDraftPayload) {
  if (payload.prefillSignature !== null) return false;
  return JSON.stringify(payload.formValues) === JSON.stringify(ACCOMMODATIONS_FORM_DEFAULT_VALUES);
}

function clearAccommodationsDraftFromStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACCOMMODATIONS_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage deletion failures.
  }
}

function readAccommodationsDraftFromStorage(): AccommodationsDraftPayload | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(ACCOMMODATIONS_DRAFT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AccommodationsDraftPayload>;
    const parsedValues = addAccommodationsSchema.partial().safeParse(parsed.formValues);
    if (!parsedValues.success) {
      clearAccommodationsDraftFromStorage();
      return null;
    }

    const prefillSignature =
      typeof parsed.prefillSignature === "string" ? parsed.prefillSignature : null;

    return {
      formValues: {
        ...ACCOMMODATIONS_FORM_DEFAULT_VALUES,
        ...(parsedValues.data as Partial<AddAccommodationsFormData>),
      },
      prefillSignature,
    };
  } catch {
    clearAccommodationsDraftFromStorage();
    return null;
  }
}

function writeAccommodationsDraftToStorage(payload: AccommodationsDraftPayload) {
  if (typeof window === "undefined") return;

  try {
    if (isDraftEffectivelyEmpty(payload)) {
      window.localStorage.removeItem(ACCOMMODATIONS_DRAFT_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(ACCOMMODATIONS_DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures.
  }
}

function toBoolean(value: "yes" | "no"): boolean {
  return value === "yes";
}

function isAllowedValue<T extends string>(value: string | null | undefined, allowed: readonly T[]): value is T {
  return Boolean(value && (allowed as readonly string[]).includes(value));
}

function filterAllowedValues<T extends string>(values: string[] | undefined, allowed: readonly T[]): T[] {
  if (!values) return [];
  const allowedSet = new Set<string>(allowed);
  return Array.from(new Set(values)).filter((value): value is T => allowedSet.has(value));
}

function getSuggestionField(fieldKey: AiSuggestedField) {
  return ACCOMMODATIONS_SUGGESTION_FIELDS.find((field) => field.key === fieldKey);
}

function getSuggestionFieldOptions(
  fieldKey: AiSuggestedField,
  locationTypes: Array<{ value: string; label: string }>
): AccommodationsOption[] {
  if (fieldKey === "type") {
    return locationTypes.map((option) => ({
      value: option.value,
      label: option.label,
      description: "Accommodation type from the configured taxonomy.",
    }));
  }
  if (fieldKey === "checkInTime") return [...CHECK_IN_TIME_OPTIONS];
  if (fieldKey === "checkOutTime") return [...CHECK_OUT_TIME_OPTIONS];

  const field = getSuggestionField(fieldKey);
  return field && "options" in field ? [...field.options] : [];
}

function formatSuggestionValue(
  suggestion: string | string[] | null,
  options: AccommodationsOption[]
) {
  if (!suggestion) return "No suggestion";
  const labelsByValue = new Map(options.map((option) => [option.value, option.label]));
  const values = Array.isArray(suggestion) ? suggestion : [suggestion];
  return values.map((value) => labelsByValue.get(value) || value).join(", ");
}

function validateClientSuggestion(
  suggestion: string | string[] | null,
  options: AccommodationsOption[],
  isMulti: boolean
) {
  const allowed = new Set(options.map((option) => option.value));
  if (isMulti) {
    if (!Array.isArray(suggestion)) return null;
    const validValues = Array.from(
      new Set(suggestion.filter((value): value is string => typeof value === "string" && allowed.has(value)))
    );
    return validValues.length > 0 ? validValues : null;
  }

  return typeof suggestion === "string" && allowed.has(suggestion) ? suggestion : null;
}

function ApiFilledBadge() {
  return (
    <span className="inline-flex items-center rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase leading-none tracking-normal text-emerald-500">
      API filled
    </span>
  );
}

function AiSuggestedBadge() {
  return (
    <span className="inline-flex items-center rounded-sm border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase leading-none tracking-normal text-sky-500">
      AI suggested
    </span>
  );
}

function ManuallySelectedBadge() {
  return (
    <span className="inline-flex items-center rounded-sm border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase leading-none tracking-normal text-amber-500">
      Manually selected
    </span>
  );
}

function AutoFillProgressOverlay({ progress }: { progress: AutoFillProgress | null }) {
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

function AutoFillEvidencePanel({
  evidence,
}: {
  evidence: Partial<Record<AiSuggestedField, AccommodationsFieldSuggestionResponse>>;
}) {
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

function FieldLabel({
  children,
  apiFilled,
  aiSuggested,
  manuallySelected,
  canSuggest,
  isSuggesting,
  onSuggest,
}: {
  children: string;
  apiFilled?: boolean;
  aiSuggested?: boolean;
  manuallySelected?: boolean;
  canSuggest?: boolean;
  isSuggesting?: boolean;
  onSuggest?: () => void;
}) {
  return (
    <Label className="flex flex-wrap items-center gap-2">
      <span>{children}</span>
      {apiFilled && <ApiFilledBadge />}
      {aiSuggested && <AiSuggestedBadge />}
      {manuallySelected && <ManuallySelectedBadge />}
      {canSuggest && onSuggest && (
        <button
          type="button"
          onClick={onSuggest}
          disabled={isSuggesting}
          title={`Suggest ${children}`}
          className="inline-flex h-6 items-center gap-1 rounded-sm border border-border bg-background px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSuggesting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {isSuggesting ? "Suggesting..." : "Suggest"}
        </button>
      )}
    </Label>
  );
}

function OptionSelect({
  label,
  options,
  value,
  onChange,
  error,
  apiFilled,
  aiSuggested,
  manuallySelected,
  canSuggest,
  isSuggesting,
  onSuggest,
}: OptionSelectProps) {
  return (
    <div className="space-y-2">
      <FieldLabel
        apiFilled={apiFilled}
        aiSuggested={aiSuggested}
        manuallySelected={manuallySelected}
        canSuggest={canSuggest}
        isSuggesting={isSuggesting}
        onSuggest={onSuggest}
      >
        {label}
      </FieldLabel>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground"
      >
        <option value="" disabled>— Select —</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium w-44">Option</th>
              <th className="text-left px-2 py-1.5 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {options.map((option) => (
              <tr key={option.value} className={value === option.value ? "bg-primary/10" : "border-t border-border"}>
                <td className="px-2 py-1.5 font-medium">{option.label}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{option.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function MultiOptionTable({
  label,
  options,
  values,
  onToggle,
  error,
  apiFilled,
  aiSuggested,
  manuallySelected,
  canSuggest,
  isSuggesting,
  onSuggest,
}: MultiOptionTableProps) {
  return (
    <div className="space-y-2">
      <FieldLabel
        apiFilled={apiFilled}
        aiSuggested={aiSuggested}
        manuallySelected={manuallySelected}
        canSuggest={canSuggest}
        isSuggesting={isSuggesting}
        onSuggest={onSuggest}
      >
        {label}
      </FieldLabel>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium w-24">Select</th>
              <th className="text-left px-2 py-1.5 font-medium w-44">Option</th>
              <th className="text-left px-2 py-1.5 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {options.map((option) => {
              const isChecked = values.includes(option.value);
              return (
                <tr key={option.value} className={isChecked ? "bg-primary/10 border-t border-border" : "border-t border-border"}>
                  <td className="px-2 py-1.5">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggle(option.value)}
                      />
                      <span className="text-[11px]">{isChecked ? "Selected" : "Select"}</span>
                    </label>
                  </td>
                  <td className="px-2 py-1.5 font-medium">{option.label}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{option.description}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SectionHeader({
  title,
  isComplete = false,
  canSuggestAll,
  isSuggestingAll,
  onSuggestAll,
}: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {isComplete && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Complete
          </span>
        )}
      </div>
      {onSuggestAll && (
        <button
          type="button"
          onClick={onSuggestAll}
          disabled={!canSuggestAll || isSuggestingAll}
          className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-400 transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSuggestingAll ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {isSuggestingAll ? "Suggesting step..." : "Suggest all"}
        </button>
      )}
    </div>
  );
}

function SuggestionStackOverlay({
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
                    <div
                      key={`${source.label}-${idx}`}
                      className="rounded-md border border-border p-2"
                    >
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

const CORE_SUGGESTION_FIELDS: AiSuggestedField[] = ["type", "price"];
const STAY_SUGGESTION_FIELDS: AiSuggestedField[] = [
  "perfectFor", "kidFriendly", "ac", "wifi", "extraGuestFee", "parking", "breakfastServed",
];
const EXPERIENCE_SUGGESTION_FIELDS: AiSuggestedField[] = [
  "vibe", "workspace", "restaurant", "pool", "rooftopLounge", "jacuzzi", "gym",
];
const DETAILS_SUGGESTION_FIELDS: AiSuggestedField[] = ["walkability", "checkInTime", "checkOutTime"];
const AUTO_AI_SUGGESTION_FIELDS: AiSuggestedField[] = [
  ...CORE_SUGGESTION_FIELDS,
  ...STAY_SUGGESTION_FIELDS,
  ...EXPERIENCE_SUGGESTION_FIELDS,
  ...DETAILS_SUGGESTION_FIELDS,
];

export function AddAccommodationsLocation() {
  const [activeSection, setActiveSection] = useState<AccommodationsFormSection>("step1");
  const [isPrefillingGoogle, setIsPrefillingGoogle] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillSignature, setPrefillSignature] = useState<string | null>(null);
  const [apiFilledFields, setApiFilledFields] = useState<Set<ApiFilledField>>(() => new Set());
  const [googlePrefillContext, setGooglePrefillContext] = useState<GooglePrefillResponse | null>(null);
  const [aiSuggestedFields, setAiSuggestedFields] = useState<Set<AiSuggestedField>>(() => new Set());
  const [manuallySelectedFields, setManuallySelectedFields] = useState<Set<AiSuggestedField>>(() => new Set());
  const [pendingFields, setPendingFields] = useState<Set<AiSuggestedField>>(() => new Set());
  const [suggestionStack, setSuggestionStack] = useState<AccommodationsFieldSuggestionResponse[]>([]);
  const [autoFillProgress, setAutoFillProgress] = useState<AutoFillProgress | null>(null);
  const [aiSuggestionEvidence, setAiSuggestionEvidence] = useState<
    Partial<Record<AiSuggestedField, AccommodationsFieldSuggestionResponse>>
  >({});
  const [createdName, setCreatedName] = useState<string | null>(null);
  const hasHydratedDraftRef = useRef(false);

  const form = useForm<AddAccommodationsFormData>({
    resolver: zodResolver(addAccommodationsSchema),
    defaultValues: ACCOMMODATIONS_FORM_DEFAULT_VALUES,
    mode: "onChange",
  });

  const navigate = useNavigate();
  const { mutate: createLocation, isPending, error } = useCreateLocation();
  const [photoSession, setPhotoSession] = useState<PhotoImportSessionState | null>(null);
  const [isCreatingWithPhotos, setIsCreatingWithPhotos] = useState(false);
  const [photoSubmitError, setPhotoSubmitError] = useState<Error | null>(null);
  const photoReady = photoSession?.ready ?? false;
  const photoCount = photoSession?.cropped.length ?? 0;
  const selectedCount = photoSession?.selected.length ?? 0;
  const { data: locationTypes = [], isLoading: isLoadingTypes } = useLocationTypes("accommodations");

  useEffect(() => {
    const draft = readAccommodationsDraftFromStorage();
    if (!draft) {
      hasHydratedDraftRef.current = true;
      return;
    }

    form.reset(draft.formValues);
    setPrefillSignature(draft.prefillSignature);
    setPrefillMessage("Restored unsaved draft from your previous session.");
    setPrefillError(null);
    hasHydratedDraftRef.current = true;
  }, [form]);

  useEffect(() => {
    const subscription = form.watch((value) => {
      if (!hasHydratedDraftRef.current) return;

      writeAccommodationsDraftToStorage({
        formValues: {
          ...ACCOMMODATIONS_FORM_DEFAULT_VALUES,
          ...(value as Partial<AddAccommodationsFormData>),
        },
        prefillSignature,
      });
    });

    return () => subscription.unsubscribe();
  }, [form, prefillSignature]);

  useEffect(() => {
    if (!hasHydratedDraftRef.current) return;

    writeAccommodationsDraftToStorage({
      formValues: form.getValues(),
      prefillSignature,
    });
  }, [form, prefillSignature]);

  const currentPrefillSignature = buildAccommodationsPrefillSignature(
    form.watch("name"),
    form.watch("address")
  );
  const isPrefillReady = prefillSignature !== null && prefillSignature === currentPrefillSignature;
  const prefillIsStale = prefillSignature !== null && !isPrefillReady;
  const canRunGooglePrefill = !isPrefillReady && !isPrefillingGoogle && !isPending;
  const isApiFilled = (field: string) => apiFilledFields.has(field as ApiFilledField);
  const isAiSuggested = (field: AiSuggestedField) => aiSuggestedFields.has(field);
  const isManuallySelected = (field: AiSuggestedField) => manuallySelectedFields.has(field);
  const getCanSuggestField = (field: AiSuggestedField) => {
    if (pendingFields.has(field) || suggestionStack.some((s) => s.fieldKey === field)) return false;
    const options = getSuggestionFieldOptions(field, locationTypes);
    const isDirty = Boolean(form.formState.dirtyFields[field]);
    const currentValue = form.watch(field) as AddAccommodationsFormData[AiSuggestedField];

    return isAccommodationOptionSuggestionEligible({
      value: currentValue,
      defaultValue: ACCOMMODATIONS_FORM_DEFAULT_VALUES[field],
      isPrefillReady,
      optionsCount: options.length,
      isDirty,
      isApiFilled: isApiFilled(field),
      isAiSuggested: isAiSuggested(field),
    });
  };
  const isEmptyOrDefaultSuggestionField = (field: AiSuggestedField) => {
    const currentValue = form.getValues(field) as AddAccommodationsFormData[AiSuggestedField];
    return (
      optionValueIsEmpty(currentValue) ||
      optionValueMatchesDefault(currentValue, ACCOMMODATIONS_FORM_DEFAULT_VALUES[field])
    );
  };

  const hasValue = (value: string | undefined) => Boolean(value && value.trim().length > 0);
  const stepOneComplete = isPrefillReady;
  const entitiesComplete = isPrefillReady;
  const coreComplete = Boolean(form.watch("price")) && (form.watch("type")?.length ?? 0) > 0;
  const stayComplete =
    (form.watch("perfectFor")?.length ?? 0) > 0 &&
    hasValue(form.watch("kidFriendly")) &&
    hasValue(form.watch("ac")) &&
    hasValue(form.watch("wifi")) &&
    hasValue(form.watch("extraGuestFee")) &&
    (form.watch("parking")?.length ?? 0) > 0 &&
    hasValue(form.watch("breakfastServed"));
  const experienceComplete =
    (form.watch("vibe")?.length ?? 0) > 0 &&
    (form.watch("workspace")?.length ?? 0) > 0 &&
    hasValue(form.watch("restaurant")) &&
    (form.watch("pool")?.length ?? 0) > 0 &&
    hasValue(form.watch("rooftopLounge")) &&
    (form.watch("jacuzzi")?.length ?? 0) > 0 &&
    hasValue(form.watch("gym"));
  const detailsComplete =
    hasValue(form.watch("walkability")) &&
    hasValue(form.watch("phone")) &&
    hasValue(form.watch("websiteUrl")) &&
    hasValue(form.watch("checkInTime")) &&
    hasValue(form.watch("checkOutTime"));
  const missingRequiredFields = [
    !isPrefillReady ? "Google lookup" : null,
    !hasValue(form.watch("type")) ? "Type" : null,
    !hasValue(form.watch("price")) ? "Price" : null,
    (form.watch("perfectFor")?.length ?? 0) === 0 ? "Perfect For" : null,
    !hasValue(form.watch("kidFriendly")) ? "Kid Friendly" : null,
    !hasValue(form.watch("ac")) ? "AC" : null,
    !hasValue(form.watch("wifi")) ? "WiFi" : null,
    !hasValue(form.watch("extraGuestFee")) ? "Extra Adult Guest Fee" : null,
    (form.watch("parking")?.length ?? 0) === 0 ? "Parking" : null,
    !hasValue(form.watch("breakfastServed")) ? "Breakfast Served" : null,
    (form.watch("vibe")?.length ?? 0) === 0 ? "Vibe" : null,
    (form.watch("workspace")?.length ?? 0) === 0 ? "Workspace" : null,
    !hasValue(form.watch("restaurant")) ? "Restaurant" : null,
    (form.watch("pool")?.length ?? 0) === 0 ? "Pool" : null,
    !hasValue(form.watch("rooftopLounge")) ? "Rooftop Lounge" : null,
    (form.watch("jacuzzi")?.length ?? 0) === 0 ? "Jacuzzi" : null,
    !hasValue(form.watch("gym")) ? "Gym" : null,
    !hasValue(form.watch("walkability")) ? "Walkability" : null,
    !hasValue(form.watch("checkInTime")) ? "Check-In Time" : null,
    !hasValue(form.watch("checkOutTime")) ? "Check-Out Time" : null,
    !hasValue(form.watch("phone")) ? "Phone" : null,
    !hasValue(form.watch("websiteUrl")) ? "Website URL" : null,
    !hasValue(form.watch("placeId")) ? "Place ID" : null,
    !hasValue(form.watch("latitude")) ? "Latitude" : null,
    !hasValue(form.watch("longitude")) ? "Longitude" : null,
  ].filter((field): field is string => Boolean(field));
  const createDisabledReason =
    missingRequiredFields.length > 0
      ? `Missing: ${missingRequiredFields.slice(0, 6).join(", ")}${missingRequiredFields.length > 6 ? "..." : ""}`
      : !form.formState.isValid
        ? "Fix invalid field values before creating."
        : null;

  const canOpenSection = (section: AccommodationsFormSection) => {
    if (section === "step1") return true;
    return isPrefillReady;
  };

  const goToSection = (section: AccommodationsFormSection) => {
    if (!canOpenSection(section)) return;
    setActiveSection(section);
  };

  const goToNextSection = () => {
    const currentIndex = ACCOMMODATIONS_SECTION_ORDER.indexOf(activeSection);
    const nextSection = ACCOMMODATIONS_SECTION_ORDER[currentIndex + 1];
    if (nextSection) {
      goToSection(nextSection);
    }
  };

  const goToPreviousSection = () => {
    const currentIndex = ACCOMMODATIONS_SECTION_ORDER.indexOf(activeSection);
    const previousSection = ACCOMMODATIONS_SECTION_ORDER[currentIndex - 1];
    if (previousSection) {
      goToSection(previousSection);
    }
  };

  const handleClearExceptStep1 = () => {
    const name = form.getValues("name");
    const address = form.getValues("address");
    form.reset({ ...ACCOMMODATIONS_FORM_DEFAULT_VALUES, name, address });
    setPrefillSignature(null);
    setPrefillMessage(null);
    setPrefillError(null);
    setApiFilledFields(new Set());
    setAiSuggestedFields(new Set());
    setManuallySelectedFields(new Set());
    setGooglePrefillContext(null);
    setPendingFields(new Set());
    setSuggestionStack([]);
    setAutoFillProgress(null);
    setAiSuggestionEvidence({});
    clearAccommodationsDraftFromStorage();
  };

  const flowSections: Array<{ key: AccommodationsFormSection; label: string; complete: boolean }> = [
    { key: "step1", label: "Step 1", complete: stepOneComplete },
    { key: "entities", label: "Entities", complete: entitiesComplete },
    { key: "core", label: "Core", complete: coreComplete },
    { key: "stay", label: "Stay", complete: stayComplete },
    { key: "experience", label: "Experience", complete: experienceComplete },
    { key: "details", label: "Details", complete: detailsComplete },
    { key: "photos", label: "Photos", complete: photoReady || selectedCount === 0 },
  ];

  useEffect(() => {
    if (!isPrefillReady && activeSection !== "step1") {
      setActiveSection("step1");
    }
  }, [isPrefillReady, activeSection]);

  const setSingleOptionField = <TField extends Exclude<AiSuggestedField, MultiField>>(
    field: TField,
    value: AddAccommodationsFormData[TField]
  ) => {
    form.setValue(field, value as never, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });
    setAiSuggestedFields((current) => {
      const next = new Set(current);
      next.delete(field);
      return next;
    });
    setAiSuggestionEvidence((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setManuallySelectedFields((current) => {
      const next = new Set(current);
      next.add(field);
      return next;
    });
  };

  const toggleMultiOption = (field: MultiField, value: string) => {
    const currentValues = (form.getValues(field) || []) as string[];
    const nextValues = currentValues.includes(value)
      ? currentValues.filter((item) => item !== value)
      : [...currentValues, value];

    form.setValue(field, nextValues as AddAccommodationsFormData[MultiField], {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });
    setAiSuggestedFields((current) => {
      const next = new Set(current);
      next.delete(field);
      return next;
    });
    setAiSuggestionEvidence((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setManuallySelectedFields((current) => {
      const next = new Set(current);
      next.add(field);
      return next;
    });
  };

  const buildSuggestionRequest = (
    fieldKey: AiSuggestedField,
    prefillContext: GooglePrefillResponse | null
  ) => {
    const allowedOptions = getSuggestionFieldOptions(fieldKey, locationTypes);

    return {
      category: "accommodations" as const,
      fieldKey,
      formValues: form.getValues() as unknown as Record<string, unknown>,
      apiContext: {
        googleUrl: prefillContext?.googleUrl || form.getValues("googleUrl") || null,
        placeId: prefillContext?.placeId || form.getValues("placeId") || null,
        locationKey: prefillContext?.locationKey || form.getValues("locationKey") || null,
        district: prefillContext?.district || form.getValues("district") || null,
        ianaTimeId: prefillContext?.ianaTimeId || form.getValues("ianaTimeId") || null,
        phoneNumber: prefillContext?.phoneNumber || form.getValues("phone") || null,
        website: prefillContext?.website || form.getValues("websiteUrl") || null,
        priceLevel: prefillContext?.priceLevel || null,
        accommodationsHints: prefillContext?.accommodationsHints || null,
      },
      allowedOptions,
    };
  };

  const applySuggestionToField = (
    item: AccommodationsFieldSuggestionResponse,
    source: "auto" | "manual"
  ) => {
    const fieldKey = item.fieldKey as AiSuggestedField;
    const allowedOptions = getSuggestionFieldOptions(fieldKey, locationTypes);
    const validatedSuggestion = validateClientSuggestion(
      item.suggestion,
      allowedOptions,
      item.kind === "multi"
    );

    if (!validatedSuggestion) return false;

    form.setValue(fieldKey, validatedSuggestion as never, {
      shouldDirty: source === "manual",
      shouldValidate: true,
      shouldTouch: true,
    });
    setAiSuggestedFields((prev) => new Set(prev).add(fieldKey));
    setManuallySelectedFields((prev) => {
      const next = new Set(prev);
      next.delete(fieldKey);
      return next;
    });
    if (source === "auto") {
      setAiSuggestionEvidence((prev) => ({ ...prev, [fieldKey]: item }));
    }
    return true;
  };

  const runAutoAiFill = async (
    prefillContext: GooglePrefillResponse,
    apiFields: Set<ApiFilledField>
  ) => {
    const eligibleFields = AUTO_AI_SUGGESTION_FIELDS.filter((field) => {
      const fieldDefinition = getSuggestionField(field);
      const options = getSuggestionFieldOptions(field, locationTypes);
      return (
        Boolean(fieldDefinition) &&
        options.length > 0 &&
        !apiFields.has(field as ApiFilledField) &&
        isEmptyOrDefaultSuggestionField(field)
      );
    });

    if (eligibleFields.length === 0) {
      setAutoFillProgress(null);
      return { applied: 0, failed: 0, total: 0 };
    }

    setAutoFillProgress({
      total: eligibleFields.length,
      completed: 0,
      applied: 0,
      failed: 0,
      currentFieldLabel: "Starting AI fill",
    });

    let cursor = 0;
    let applied = 0;
    let failed = 0;

    const worker = async () => {
      while (cursor < eligibleFields.length) {
        const fieldKey = eligibleFields[cursor];
        cursor += 1;
        const field = getSuggestionField(fieldKey);
        setPendingFields((prev) => new Set(prev).add(fieldKey));
        setAutoFillProgress((prev) =>
          prev ? { ...prev, currentFieldLabel: field?.label || fieldKey } : prev
        );

        try {
          const response = await locationsApi.suggestField(
            buildSuggestionRequest(fieldKey, prefillContext)
          );
          const didApply = !response.error && applySuggestionToField(response, "auto");
          if (didApply) {
            applied += 1;
          } else {
            failed += 1;
            setAiSuggestionEvidence((prev) => ({ ...prev, [fieldKey]: response }));
          }
        } catch (err) {
          failed += 1;
          setAiSuggestionEvidence((prev) => ({
            ...prev,
            [fieldKey]: {
              fieldKey,
              fieldLabel: field?.label || fieldKey,
              suggestion: null,
              kind: field?.kind || "single",
              confidence: 0,
              source: "ai",
              reason: "",
              sources: [],
              error: getErrorMessage(err),
            },
          }));
        } finally {
          setPendingFields((prev) => {
            const next = new Set(prev);
            next.delete(fieldKey);
            return next;
          });
          setAutoFillProgress((prev) =>
            prev
              ? {
                  ...prev,
                  completed: prev.completed + 1,
                  applied,
                  failed,
                }
              : prev
          );
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(AUTO_FILL_CONCURRENCY, eligibleFields.length) }, () => worker())
    );
    setAutoFillProgress(null);
    return { applied, failed, total: eligibleFields.length };
  };

  const handleGooglePrefill = async () => {
    if (isPrefillReady) {
      setPrefillMessage("Google lookup already ran for this name and address. Change name/address or clear fields to run it again.");
      setPrefillError(null);
      return;
    }

    setPrefillError(null);
    setPrefillMessage(null);
    setApiFilledFields(new Set());
    setAiSuggestedFields(new Set());
    setManuallySelectedFields(new Set());
    setGooglePrefillContext(null);
    setPendingFields(new Set());
    setSuggestionStack([]);
    setAutoFillProgress(null);
    setAiSuggestionEvidence({});

    const isStepValid = await form.trigger(["name", "address"]);
    if (!isStepValid) {
      setPrefillSignature(null);
      setPrefillError("Enter a valid name and address before running Google lookup.");
      return;
    }

    const name = form.getValues("name").trim();
    const normalizedAddress = normalizeAccommodationsAddress(form.getValues("address"));
    form.setValue("address", normalizedAddress, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });

    setIsPrefillingGoogle(true);

    try {
      const prefill = await locationsApi.googlePrefill("accommodations", {
        name,
        address: normalizedAddress,
      });
      const nextApiFilledFields = new Set<ApiFilledField>();

      form.setValue("placeId", prefill.placeId, {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      nextApiFilledFields.add("placeId");
      form.setValue("latitude", String(prefill.lat), {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      nextApiFilledFields.add("latitude");
      form.setValue("longitude", String(prefill.lng), {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      nextApiFilledFields.add("longitude");
      form.setValue("googleUrl", prefill.googleUrl, {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      nextApiFilledFields.add("googleUrl");
      form.setValue("googleMapsUrl", prefill.googleUrl, {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      nextApiFilledFields.add("googleMapsUrl");
      form.setValue("locationKey", prefill.locationKey || "", {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      if (prefill.locationKey) nextApiFilledFields.add("locationKey");
      form.setValue("district", prefill.district || "", {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      if (prefill.district) nextApiFilledFields.add("district");
      form.setValue("ianaTimeId", prefill.ianaTimeId || "", {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      if (prefill.ianaTimeId) nextApiFilledFields.add("ianaTimeId");
      if (prefill.phoneNumber) {
        form.setValue("phone", prefill.phoneNumber, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
        nextApiFilledFields.add("phone");
      }
      if (prefill.website) {
        form.setValue("websiteUrl", prefill.website, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
        nextApiFilledFields.add("websiteUrl");
      }

      const appliedEnrichmentFields: string[] = [];
      const hints = prefill.accommodationsHints;
      const priceHint = hints?.price || prefill.priceLevel;

      if (isAllowedValue(priceHint, PRICE_VALUES)) {
        form.setValue("price", priceHint, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
        appliedEnrichmentFields.push("price");
        nextApiFilledFields.add("price");
      }

      const perfectForHints = filterAllowedValues(hints?.perfectFor, PERFECT_FOR_VALUES);
      if (perfectForHints.length > 0) {
        form.setValue("perfectFor", perfectForHints, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
        appliedEnrichmentFields.push("perfect for");
        nextApiFilledFields.add("perfectFor");
      }

      const acHint = hints?.ac;
      if (isAllowedValue(acHint, ["yes", "no"] as const)) {
        form.setValue("ac", acHint, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
        appliedEnrichmentFields.push("AC");
        nextApiFilledFields.add("ac");
      }

      const wifiHint = hints?.wifi;
      if (isAllowedValue(wifiHint, ["yes", "no"] as const)) {
        form.setValue("wifi", wifiHint, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
        appliedEnrichmentFields.push("wifi");
        nextApiFilledFields.add("wifi");
      }

      const parkingHints = filterAllowedValues(hints?.parking, PARKING_VALUES);
      if (parkingHints.length > 0) {
        form.setValue("parking", parkingHints, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
        appliedEnrichmentFields.push("parking");
        nextApiFilledFields.add("parking");
      }

      const poolHints = filterAllowedValues(hints?.pool, POOL_VALUES);
      if (poolHints.length > 0) {
        form.setValue("pool", poolHints, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
        appliedEnrichmentFields.push("pool");
        nextApiFilledFields.add("pool");
      }

      setApiFilledFields(nextApiFilledFields);
      setGooglePrefillContext(prefill);
      setPrefillSignature(buildAccommodationsPrefillSignature(name, normalizedAddress));
      const autoFillResult = await runAutoAiFill(prefill, nextApiFilledFields);
      setPrefillMessage(
        `Google lookup complete. Place ID, coordinates, location key, district, time zone, phone, and website were prefilled when available.${
          appliedEnrichmentFields.length > 0
            ? ` Additional enrichment filled ${appliedEnrichmentFields.join(", ")}.`
            : ""
        }${
          autoFillResult.total > 0
            ? ` AI filled ${autoFillResult.applied}/${autoFillResult.total} eligible fields${
                autoFillResult.failed > 0 ? `; ${autoFillResult.failed} need manual review.` : "."
              }`
            : ""
        }`
      );
      setActiveSection("entities");
    } catch (lookupError) {
      setPrefillSignature(null);
      setGooglePrefillContext(null);
      setPrefillError(getErrorMessage(lookupError));
    } finally {
      setIsPrefillingGoogle(false);
      setAutoFillProgress(null);
    }
  };

  const queueSuggestion = async (fieldKey: AiSuggestedField) => {
    const field = getSuggestionField(fieldKey);
    const allowedOptions = getSuggestionFieldOptions(fieldKey, locationTypes);
    if (!field || allowedOptions.length === 0) return;

    setPendingFields((prev) => new Set(prev).add(fieldKey));

    try {
      const response = await locationsApi.suggestField(
        buildSuggestionRequest(fieldKey, googlePrefillContext)
      );
      setSuggestionStack((prev) => [...prev, response]);
    } catch (err) {
      setSuggestionStack((prev) => [
        ...prev,
        {
          fieldKey,
          fieldLabel: field.label,
          suggestion: null,
          kind: field.kind,
          confidence: 0,
          source: "ai",
          reason: "",
          sources: [],
          error: getErrorMessage(err),
        },
      ]);
    } finally {
      setPendingFields((prev) => {
        const next = new Set(prev);
        next.delete(fieldKey);
        return next;
      });
    }
  };

  const applyStackedSuggestion = (item: AccommodationsFieldSuggestionResponse) => {
    applySuggestionToField(item, "manual");
    setSuggestionStack((prev) => prev.filter((s) => s !== item));
  };

  const dismissStackedSuggestion = (item: AccommodationsFieldSuggestionResponse) => {
    setSuggestionStack((prev) => prev.filter((s) => s !== item));
  };

  const suggestAllFields = (fields: AiSuggestedField[]) => {
    fields.filter((f) => getCanSuggestField(f)).forEach((f) => void queueSuggestion(f));
  };

  const isSectionPending = (fields: AiSuggestedField[]) =>
    fields.some((f) => pendingFields.has(f));

  const onSubmit = (data: AddAccommodationsFormData) => {
    const submitValidation = addAccommodationsSubmitSchema.safeParse({
      prefillSignature,
      formValues: data,
    });

    if (!submitValidation.success) {
      const firstIssue = submitValidation.error.issues[0]?.message;
      setPrefillError(firstIssue || "Run Name + Address Google lookup before creating the accommodations document.");
      return;
    }

    const normalizedAddress = normalizeAccommodationsAddress(data.address);
    const latValue = data.latitude?.trim() ? Number(data.latitude) : undefined;
    const lngValue = data.longitude?.trim() ? Number(data.longitude) : undefined;

    const accommodationsDetails = buildAccommodationsDetails({
      name: data.name,
      price: data.price,
      district: data.district || "",
      type: data.type,
      perfectFor: data.perfectFor,
      kidFriendly: toBoolean(data.kidFriendly),
      ac: toBoolean(data.ac),
      wifi: toBoolean(data.wifi),
      extraGuestFee: toBoolean(data.extraGuestFee),
      parking: data.parking,
      breakfastServed: toBoolean(data.breakfastServed),
      vibe: data.vibe,
      workspace: data.workspace,
      restaurant: toBoolean(data.restaurant),
      pool: data.pool,
      rooftopLounge: toBoolean(data.rooftopLounge),
      jacuzzi: data.jacuzzi,
      gym: data.gym,
      address: normalizedAddress,
      walkability: data.walkability,
      checkInTime: data.checkInTime,
      checkOutTime: data.checkOutTime,
      phone: data.phone,
      websiteUrl: data.websiteUrl,
      bookingUrl: data.bookingUrl || "",
      googleMapsUrl: data.googleMapsUrl || "",
    });

    const payload = {
      name: data.name,
      title: data.title?.trim() || data.name,
      address: normalizedAddress,
      category: "accommodations" as const,
      type: data.type,
      priceLevel: data.price,
      phoneNumber: data.phone || undefined,
      website: data.websiteUrl || undefined,
      district: data.district || undefined,
      locationKey: data.locationKey || undefined,
      ianaTimeId: data.ianaTimeId || undefined,
      placeId: data.placeId || undefined,
      url: data.googleUrl || data.googleMapsUrl || undefined,
      lat: Number.isFinite(latValue) ? latValue : undefined,
      lng: Number.isFinite(lngValue) ? lngValue : undefined,
      accommodationsDetails,
    };

    const finalizeSuccess = (response: { id: number; category: string; source: { name: string }; title?: string | null }) => {
      setCreatedName(response.title || response.source.name);
      setPhotoSession(null);
      form.reset(ACCOMMODATIONS_FORM_DEFAULT_VALUES);
      setPrefillSignature(null);
      setPrefillMessage(null);
      setPrefillError(null);
      setApiFilledFields(new Set());
      setAiSuggestedFields(new Set());
      setManuallySelectedFields(new Set());
      setGooglePrefillContext(null);
      setPendingFields(new Set());
      setSuggestionStack([]);
      setAutoFillProgress(null);
      setAiSuggestionEvidence({});
      setActiveSection("step1");
      clearAccommodationsDraftFromStorage();
    };

    const hasPhotos = !!photoSession && photoSession.cropped.length > 0;

    if (!hasPhotos) {
      createLocation(payload, {
        onSuccess: (response) => finalizeSuccess(response),
      });
      return;
    }

    // ADR-0007: atomic multipart Create with all cropped variants attached.
    setIsCreatingWithPhotos(true);
    setPhotoSubmitError(null);
    void (async () => {
      try {
        const response = await locationsApi.createLocationWithPhotos(
          payload,
          photoSession!.cropped.map((c) => ({
            sourceName: c.sourceName,
            sourceFile: c.sourceFile,
            variants: c.variants.map((v) => ({ type: v.type as string, file: v.file })),
            photographerCredit: c.photographerCredit,
          }))
        );
        await addFlowPhotoSession.clearSession(photoSession!.sessionId).catch(() => undefined);
        finalizeSuccess(response);
        navigate(`/edit/accommodations/${response.id}`);
      } catch (err) {
        const e = err instanceof Error ? err : new Error("Create with photos failed");
        setPhotoSubmitError(e);
        console.error("[AddAccommodationsLocation] createLocationWithPhotos failed", err);
      } finally {
        setIsCreatingWithPhotos(false);
      }
    })();
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-6xl rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <BedDouble className="w-4 h-4 text-muted-foreground" />
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground underline">
                  Add Accommodations
                </h1>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                asChild
                className="h-9 border-border/80 bg-background/60 px-3 text-foreground hover:bg-accent/70"
              >
                <Link to="/add">
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Link>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {flowSections.map((section, index) => {
                const isActive = activeSection === section.key;
                const isDisabled = !canOpenSection(section.key);
                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => goToSection(section.key)}
                    disabled={isDisabled}
                    className={`inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? "border-border bg-muted text-foreground"
                        : isDisabled
                          ? "cursor-not-allowed border-border/50 bg-background text-muted-foreground/55"
                          : "border-border/60 bg-background text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    <span>{index + 1}.</span>
                    <span>{section.label}</span>
                    {section.complete && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                  </button>
                );
              })}
            </div>
          </div>

          {createdName && (
            <div className="mb-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
              Created accommodations document: {createdName}
            </div>
          )}

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {activeSection === "step1" && (
              <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
                <SectionHeader title="Step 1" isComplete={stepOneComplete} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input placeholder="Location Name" {...form.register("name")} />
                    {form.formState.errors.name && (
                      <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Input placeholder="Location Address" {...form.register("address")} />
                    {form.formState.errors.address && (
                      <p className="text-xs text-destructive">{form.formState.errors.address.message}</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-between border-t border-border/70 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClearExceptStep1}
                  >
                    Clear All Except Step 1
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleGooglePrefill()}
                    disabled={!canRunGooglePrefill}
                  >
                    {isPrefillingGoogle
                      ? "Continuing..."
                      : isPrefillReady
                        ? "Lookup Complete"
                        : prefillIsStale
                          ? "Refresh Lookup"
                          : "Continue"}
                  </Button>
                </div>

                {prefillMessage && (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                    {prefillMessage}
                  </div>
                )}

                {prefillError && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    {prefillError}
                  </div>
                )}

                {prefillIsStale && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-400">
                    Name or address changed after lookup. Run Google lookup again to refresh Place ID and coordinates.
                  </div>
                )}

                <AutoFillEvidencePanel evidence={aiSuggestionEvidence} />
              </section>
            )}

            {isPrefillReady && activeSection === "entities" && (
              <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
                <SectionHeader title="Entities Fields (Optional Manual Overrides)" isComplete={entitiesComplete} />
                <AutoFillEvidencePanel evidence={aiSuggestionEvidence} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <FieldLabel apiFilled={isApiFilled("googleUrl")}>Google URL</FieldLabel>
                    <Input placeholder="https://www.google.com/maps/..." {...form.register("googleUrl")} />
                    {form.formState.errors.googleUrl && (
                      <p className="text-xs text-destructive">{form.formState.errors.googleUrl.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <FieldLabel apiFilled={isApiFilled("placeId")}>Place ID</FieldLabel>
                    <Input placeholder="ChIJ..." {...form.register("placeId")} />
                    {form.formState.errors.placeId && (
                      <p className="text-xs text-destructive">{form.formState.errors.placeId.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <FieldLabel apiFilled={isApiFilled("latitude")}>Latitude</FieldLabel>
                    <Input placeholder="25.7743" {...form.register("latitude")} />
                    {form.formState.errors.latitude && (
                      <p className="text-xs text-destructive">{form.formState.errors.latitude.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <FieldLabel apiFilled={isApiFilled("longitude")}>Longitude</FieldLabel>
                    <Input placeholder="-80.1937" {...form.register("longitude")} />
                    {form.formState.errors.longitude && (
                      <p className="text-xs text-destructive">{form.formState.errors.longitude.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <FieldLabel apiFilled={isApiFilled("ianaTimeId")}>Time Zone (IANA)</FieldLabel>
                    <Input placeholder="America/New_York" {...form.register("ianaTimeId")} />
                    {form.formState.errors.ianaTimeId && (
                      <p className="text-xs text-destructive">{form.formState.errors.ianaTimeId.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <FieldLabel apiFilled={isApiFilled("district")}>District</FieldLabel>
                    <Input placeholder="Financial District" {...form.register("district")} />
                    {form.formState.errors.district && (
                      <p className="text-xs text-destructive">{form.formState.errors.district.message}</p>
                    )}
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <FieldLabel apiFilled={isApiFilled("locationKey")}>Location Key</FieldLabel>
                    <Input placeholder="united-states|miami|financial-district" {...form.register("locationKey")} />
                    {form.formState.errors.locationKey && (
                      <p className="text-xs text-destructive">{form.formState.errors.locationKey.message}</p>
                    )}
                  </div>
                </div>
                <div className="flex justify-between border-t border-border/70 pt-4">
                  <Button type="button" variant="outline" onClick={goToPreviousSection}>
                    Previous
                  </Button>
                  <Button type="button" onClick={goToNextSection}>
                    Next
                  </Button>
                </div>
              </section>
            )}

            {isPrefillReady && activeSection === "core" && (
              <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
                <SectionHeader
                  title="Core"
                  isComplete={coreComplete}
                  canSuggestAll={CORE_SUGGESTION_FIELDS.some((f) => getCanSuggestField(f))}
                  isSuggestingAll={isSectionPending(CORE_SUGGESTION_FIELDS)}
                  onSuggestAll={() => suggestAllFields(CORE_SUGGESTION_FIELDS)}
                />
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <FieldLabel
                      aiSuggested={isAiSuggested("type")}
                      manuallySelected={isManuallySelected("type")}
                      canSuggest={getCanSuggestField("type")}
                      isSuggesting={pendingFields.has("type")}
                      onSuggest={() => void queueSuggestion("type")}
                    >
                      Type
                    </FieldLabel>
                    <select
                      value={form.watch("type") || ""}
                      onChange={(event) => setSingleOptionField("type", event.target.value)}
                      disabled={isLoadingTypes}
                      className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground"
                    >
                      <option value="">
                        {isLoadingTypes ? "Loading types..." : "Select a type"}
                      </option>
                      {locationTypes.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {form.formState.errors.type && (
                      <p className="text-xs text-destructive">{form.formState.errors.type.message}</p>
                    )}
                  </div>
                  <OptionSelect
                    label="Price"
                    options={PRICE_OPTIONS}
                    value={form.watch("price")}
                    onChange={(value) =>
                      setSingleOptionField("price", value as AddAccommodationsFormData["price"])
                    }
                    error={form.formState.errors.price?.message}
                    apiFilled={isApiFilled("price")}
                    aiSuggested={isAiSuggested("price")}
                    manuallySelected={isManuallySelected("price")}
                    canSuggest={getCanSuggestField("price")}
                    isSuggesting={pendingFields.has("price")}
                    onSuggest={() => void queueSuggestion("price")}
                  />
                </div>
                <div className="flex justify-between border-t border-border/70 pt-4">
                  <Button type="button" variant="outline" onClick={goToPreviousSection}>
                    Previous
                  </Button>
                  <Button type="button" onClick={goToNextSection}>
                    Next
                  </Button>
                </div>
              </section>
            )}

            {isPrefillReady && activeSection === "stay" && (
              <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
                <SectionHeader
                  title="The Stay"
                  isComplete={stayComplete}
                  canSuggestAll={STAY_SUGGESTION_FIELDS.some((f) => getCanSuggestField(f))}
                  isSuggestingAll={isSectionPending(STAY_SUGGESTION_FIELDS)}
                  onSuggestAll={() => suggestAllFields(STAY_SUGGESTION_FIELDS)}
                />
                <MultiOptionTable
                  label="Perfect For"
                  options={PERFECT_FOR_OPTIONS}
                  values={form.watch("perfectFor")}
                  onToggle={(value) => toggleMultiOption("perfectFor", value)}
                  error={form.formState.errors.perfectFor?.message}
                  apiFilled={isApiFilled("perfectFor")}
                  aiSuggested={isAiSuggested("perfectFor")}
                  manuallySelected={isManuallySelected("perfectFor")}
                  canSuggest={getCanSuggestField("perfectFor")}
                  isSuggesting={pendingFields.has("perfectFor")}
                  onSuggest={() => void queueSuggestion("perfectFor")}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <OptionSelect
                    label="Kid Friendly"
                    options={BOOLEAN_OPTIONS}
                    value={form.watch("kidFriendly")}
                    onChange={(value) =>
                      setSingleOptionField("kidFriendly", value as AddAccommodationsFormData["kidFriendly"])
                    }
                    error={form.formState.errors.kidFriendly?.message}
                    aiSuggested={isAiSuggested("kidFriendly")}
                    manuallySelected={isManuallySelected("kidFriendly")}
                    canSuggest={getCanSuggestField("kidFriendly")}
                    isSuggesting={pendingFields.has("kidFriendly")}
                    onSuggest={() => void queueSuggestion("kidFriendly")}
                  />
                  <OptionSelect
                    label="AC"
                    options={BOOLEAN_OPTIONS}
                    value={form.watch("ac")}
                    onChange={(value) =>
                      setSingleOptionField("ac", value as AddAccommodationsFormData["ac"])
                    }
                    error={form.formState.errors.ac?.message}
                    apiFilled={isApiFilled("ac")}
                    aiSuggested={isAiSuggested("ac")}
                    manuallySelected={isManuallySelected("ac")}
                    canSuggest={getCanSuggestField("ac")}
                    isSuggesting={pendingFields.has("ac")}
                    onSuggest={() => void queueSuggestion("ac")}
                  />
                  <OptionSelect
                    label="WiFi"
                    options={BOOLEAN_OPTIONS}
                    value={form.watch("wifi")}
                    onChange={(value) =>
                      setSingleOptionField("wifi", value as AddAccommodationsFormData["wifi"])
                    }
                    error={form.formState.errors.wifi?.message}
                    apiFilled={isApiFilled("wifi")}
                    aiSuggested={isAiSuggested("wifi")}
                    manuallySelected={isManuallySelected("wifi")}
                    canSuggest={getCanSuggestField("wifi")}
                    isSuggesting={pendingFields.has("wifi")}
                    onSuggest={() => void queueSuggestion("wifi")}
                  />
                  <OptionSelect
                    label="Extra Adult Guest Fee"
                    options={BOOLEAN_OPTIONS}
                    value={form.watch("extraGuestFee")}
                    onChange={(value) =>
                      setSingleOptionField("extraGuestFee", value as AddAccommodationsFormData["extraGuestFee"])
                    }
                    error={form.formState.errors.extraGuestFee?.message}
                    aiSuggested={isAiSuggested("extraGuestFee")}
                    manuallySelected={isManuallySelected("extraGuestFee")}
                    canSuggest={getCanSuggestField("extraGuestFee")}
                    isSuggesting={pendingFields.has("extraGuestFee")}
                    onSuggest={() => void queueSuggestion("extraGuestFee")}
                  />
                </div>
                <MultiOptionTable
                  label="Parking"
                  options={PARKING_OPTIONS}
                  values={form.watch("parking")}
                  onToggle={(value) => toggleMultiOption("parking", value)}
                  error={form.formState.errors.parking?.message}
                  apiFilled={isApiFilled("parking")}
                  aiSuggested={isAiSuggested("parking")}
                  manuallySelected={isManuallySelected("parking")}
                  canSuggest={getCanSuggestField("parking")}
                  isSuggesting={pendingFields.has("parking")}
                  onSuggest={() => void queueSuggestion("parking")}
                />
                <OptionSelect
                  label="Breakfast Served"
                  options={BOOLEAN_OPTIONS}
                  value={form.watch("breakfastServed")}
                  onChange={(value) =>
                    setSingleOptionField("breakfastServed", value as AddAccommodationsFormData["breakfastServed"])
                  }
                  error={form.formState.errors.breakfastServed?.message}
                  aiSuggested={isAiSuggested("breakfastServed")}
                  manuallySelected={isManuallySelected("breakfastServed")}
                  canSuggest={getCanSuggestField("breakfastServed")}
                  isSuggesting={pendingFields.has("breakfastServed")}
                  onSuggest={() => void queueSuggestion("breakfastServed")}
                />
                <div className="flex justify-between border-t border-border/70 pt-4">
                  <Button type="button" variant="outline" onClick={goToPreviousSection}>
                    Previous
                  </Button>
                  <Button type="button" onClick={goToNextSection}>
                    Next
                  </Button>
                </div>
              </section>
            )}

            {isPrefillReady && activeSection === "experience" && (
              <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
                <SectionHeader
                  title="The Experience"
                  isComplete={experienceComplete}
                  canSuggestAll={EXPERIENCE_SUGGESTION_FIELDS.some((f) => getCanSuggestField(f))}
                  isSuggestingAll={isSectionPending(EXPERIENCE_SUGGESTION_FIELDS)}
                  onSuggestAll={() => suggestAllFields(EXPERIENCE_SUGGESTION_FIELDS)}
                />
                <MultiOptionTable
                  label="Vibe"
                  options={VIBE_OPTIONS}
                  values={form.watch("vibe")}
                  onToggle={(value) => toggleMultiOption("vibe", value)}
                  error={form.formState.errors.vibe?.message}
                  aiSuggested={isAiSuggested("vibe")}
                  manuallySelected={isManuallySelected("vibe")}
                  canSuggest={getCanSuggestField("vibe")}
                  isSuggesting={pendingFields.has("vibe")}
                  onSuggest={() => void queueSuggestion("vibe")}
                />
                <MultiOptionTable
                  label="Workspace"
                  options={WORKSPACE_OPTIONS}
                  values={form.watch("workspace")}
                  onToggle={(value) => toggleMultiOption("workspace", value)}
                  error={form.formState.errors.workspace?.message}
                  aiSuggested={isAiSuggested("workspace")}
                  manuallySelected={isManuallySelected("workspace")}
                  canSuggest={getCanSuggestField("workspace")}
                  isSuggesting={pendingFields.has("workspace")}
                  onSuggest={() => void queueSuggestion("workspace")}
                />
                <OptionSelect
                  label="Restaurant"
                  options={BOOLEAN_OPTIONS}
                  value={form.watch("restaurant")}
                  onChange={(value) =>
                    setSingleOptionField("restaurant", value as AddAccommodationsFormData["restaurant"])
                  }
                  error={form.formState.errors.restaurant?.message}
                  aiSuggested={isAiSuggested("restaurant")}
                  manuallySelected={isManuallySelected("restaurant")}
                  canSuggest={getCanSuggestField("restaurant")}
                  isSuggesting={pendingFields.has("restaurant")}
                  onSuggest={() => void queueSuggestion("restaurant")}
                />
                <MultiOptionTable
                  label="Pool"
                  options={POOL_OPTIONS}
                  values={form.watch("pool")}
                  onToggle={(value) => toggleMultiOption("pool", value)}
                  error={form.formState.errors.pool?.message}
                  apiFilled={isApiFilled("pool")}
                  aiSuggested={isAiSuggested("pool")}
                  manuallySelected={isManuallySelected("pool")}
                  canSuggest={getCanSuggestField("pool")}
                  isSuggesting={pendingFields.has("pool")}
                  onSuggest={() => void queueSuggestion("pool")}
                />
                <OptionSelect
                  label="Rooftop Lounge"
                  options={BOOLEAN_OPTIONS}
                  value={form.watch("rooftopLounge")}
                  onChange={(value) =>
                    setSingleOptionField("rooftopLounge", value as AddAccommodationsFormData["rooftopLounge"])
                  }
                  error={form.formState.errors.rooftopLounge?.message}
                  aiSuggested={isAiSuggested("rooftopLounge")}
                  manuallySelected={isManuallySelected("rooftopLounge")}
                  canSuggest={getCanSuggestField("rooftopLounge")}
                  isSuggesting={pendingFields.has("rooftopLounge")}
                  onSuggest={() => void queueSuggestion("rooftopLounge")}
                />
                <MultiOptionTable
                  label="Jacuzzi"
                  options={JACUZZI_OPTIONS}
                  values={form.watch("jacuzzi")}
                  onToggle={(value) => toggleMultiOption("jacuzzi", value)}
                  error={form.formState.errors.jacuzzi?.message}
                  aiSuggested={isAiSuggested("jacuzzi")}
                  manuallySelected={isManuallySelected("jacuzzi")}
                  canSuggest={getCanSuggestField("jacuzzi")}
                  isSuggesting={pendingFields.has("jacuzzi")}
                  onSuggest={() => void queueSuggestion("jacuzzi")}
                />
                <OptionSelect
                  label="Gym"
                  options={GYM_OPTIONS}
                  value={form.watch("gym")}
                  onChange={(value) =>
                    setSingleOptionField("gym", value as AddAccommodationsFormData["gym"])
                  }
                  error={form.formState.errors.gym?.message}
                  aiSuggested={isAiSuggested("gym")}
                  manuallySelected={isManuallySelected("gym")}
                  canSuggest={getCanSuggestField("gym")}
                  isSuggesting={pendingFields.has("gym")}
                  onSuggest={() => void queueSuggestion("gym")}
                />
                <div className="flex justify-between border-t border-border/70 pt-4">
                  <Button type="button" variant="outline" onClick={goToPreviousSection}>
                    Previous
                  </Button>
                  <Button type="button" onClick={goToNextSection}>
                    Next
                  </Button>
                </div>
              </section>
            )}

            {isPrefillReady && activeSection === "details" && (
              <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
                <SectionHeader
                  title="The Details"
                  isComplete={detailsComplete}
                  canSuggestAll={DETAILS_SUGGESTION_FIELDS.some((f) => getCanSuggestField(f))}
                  isSuggestingAll={isSectionPending(DETAILS_SUGGESTION_FIELDS)}
                  onSuggestAll={() => suggestAllFields(DETAILS_SUGGESTION_FIELDS)}
                />
                <OptionSelect
                  label="Walkability"
                  options={WALKABILITY_OPTIONS}
                  value={form.watch("walkability")}
                  onChange={(value) =>
                    setSingleOptionField("walkability", value as AddAccommodationsFormData["walkability"])
                  }
                  error={form.formState.errors.walkability?.message}
                  aiSuggested={isAiSuggested("walkability")}
                  manuallySelected={isManuallySelected("walkability")}
                  canSuggest={getCanSuggestField("walkability")}
                  isSuggesting={pendingFields.has("walkability")}
                  onSuggest={() => void queueSuggestion("walkability")}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <FieldLabel
                      aiSuggested={isAiSuggested("checkInTime")}
                      canSuggest={getCanSuggestField("checkInTime")}
                      isSuggesting={pendingFields.has("checkInTime")}
                      onSuggest={() => void queueSuggestion("checkInTime")}
                    >
                      Check-In Time
                    </FieldLabel>
                    <Input
                      type="time"
                      value={form.watch("checkInTime")}
                      onChange={(event) =>
                        setSingleOptionField(
                          "checkInTime",
                          event.target.value as AddAccommodationsFormData["checkInTime"]
                        )
                      }
                    />
                    {form.formState.errors.checkInTime && (
                      <p className="text-xs text-destructive">{form.formState.errors.checkInTime.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <FieldLabel
                      aiSuggested={isAiSuggested("checkOutTime")}
                      canSuggest={getCanSuggestField("checkOutTime")}
                      isSuggesting={pendingFields.has("checkOutTime")}
                      onSuggest={() => void queueSuggestion("checkOutTime")}
                    >
                      Check-Out Time
                    </FieldLabel>
                    <Input
                      type="time"
                      value={form.watch("checkOutTime")}
                      onChange={(event) =>
                        setSingleOptionField(
                          "checkOutTime",
                          event.target.value as AddAccommodationsFormData["checkOutTime"]
                        )
                      }
                    />
                    {form.formState.errors.checkOutTime && (
                      <p className="text-xs text-destructive">{form.formState.errors.checkOutTime.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <FieldLabel apiFilled={isApiFilled("phone")}>Phone</FieldLabel>
                    <Input placeholder="+1 (555) 700-1200" {...form.register("phone")} />
                    {form.formState.errors.phone && (
                      <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <FieldLabel apiFilled={isApiFilled("websiteUrl")}>Website URL</FieldLabel>
                    <Input placeholder="https://example.com/hotel" {...form.register("websiteUrl")} />
                    {form.formState.errors.websiteUrl && (
                      <p className="text-xs text-destructive">{form.formState.errors.websiteUrl.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Booking URL</Label>
                    <Input placeholder="https://example.com/hotel/book" {...form.register("bookingUrl")} />
                    {form.formState.errors.bookingUrl && (
                      <p className="text-xs text-destructive">{form.formState.errors.bookingUrl.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <FieldLabel apiFilled={isApiFilled("googleMapsUrl")}>Google Maps URL</FieldLabel>
                    <Input placeholder="https://maps.google.com/..." {...form.register("googleMapsUrl")} />
                    {form.formState.errors.googleMapsUrl && (
                      <p className="text-xs text-destructive">{form.formState.errors.googleMapsUrl.message}</p>
                    )}
                  </div>
                </div>
                <div className="flex justify-between border-t border-border/70 pt-4">
                  <Button type="button" variant="outline" onClick={goToPreviousSection}>
                    Previous
                  </Button>
                  <Button type="button" onClick={goToNextSection}>
                    Next
                  </Button>
                </div>
              </section>
            )}

            {isPrefillReady && activeSection === "photos" && (
              <section className="space-y-5">
                <PhotoImportPhase
                  placeId={form.watch("placeId") || null}
                  category="accommodations"
                  onSessionChange={setPhotoSession}
                />
                <div className="flex justify-between border-t border-border/70 pt-4">
                  <Button type="button" variant="outline" onClick={goToPreviousSection}>
                    Previous
                  </Button>
                  <div className="flex flex-col items-end gap-2">
                    {createDisabledReason && (
                      <p className="max-w-md text-right text-xs text-muted-foreground">
                        {createDisabledReason}
                      </p>
                    )}
                    {photoSubmitError && (
                      <p className="max-w-md text-right text-xs text-destructive">
                        {photoSubmitError.message}
                      </p>
                    )}
                    <Button
                      type="submit"
                      disabled={
                        Boolean(createDisabledReason) ||
                        isPending ||
                        isCreatingWithPhotos ||
                        (selectedCount > 0 && !photoReady)
                      }
                      title={
                        selectedCount > 0 && !photoReady
                          ? `${photoCount} of ${selectedCount} photos cropped — finish each crop before Create`
                          : undefined
                      }
                    >
                      {isPending || isCreatingWithPhotos
                        ? "Creating..."
                        : selectedCount === 0
                          ? "Create Accommodations Document"
                          : photoReady
                            ? `Create with ${photoCount} photo${photoCount === 1 ? "" : "s"}`
                            : `Crop ${selectedCount - photoCount} more to enable Create`}
                    </Button>
                  </div>
                </div>
              </section>
            )}

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Error: {error.message}
              </div>
            )}

          </form>

          <SuggestionStackOverlay
            stack={suggestionStack}
            locationTypes={locationTypes}
            pendingCount={pendingFields.size}
            onApply={applyStackedSuggestion}
            onDismiss={dismissStackedSuggestion}
          />
          <AutoFillProgressOverlay progress={autoFillProgress} />
        </div>
      </div>
    </div>
  );
}
