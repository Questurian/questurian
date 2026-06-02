import { Button } from "@client/components/ui";
import { Check, ChevronDown, ChevronUp, Loader2, RefreshCw, X } from "lucide-react";
import type { CompletenessField } from "./location-completeness-fields";

interface LocationCompletenessSummaryProps {
  requiredFields: CompletenessField[];
  importantOptionalFields: CompletenessField[];
  missingFields: CompletenessField[];
  missingImportantOptionalFields: CompletenessField[];
  isComplete: boolean;
  isExpanded: boolean;
  shouldShowTripAdvisorButton: boolean;
  hasTripAdvisorPlaceData: boolean;
  isFetchingTripAdvisorPlace: boolean;
  onEditField: (field: CompletenessField) => void;
  onFetchTripAdvisorPlace: () => void;
  onToggleExpanded: () => void;
}

export function LocationCompletenessSummary({
  requiredFields,
  importantOptionalFields,
  missingFields,
  missingImportantOptionalFields,
  isComplete,
  isExpanded,
  shouldShowTripAdvisorButton,
  hasTripAdvisorPlaceData,
  isFetchingTripAdvisorPlace,
  onEditField,
  onFetchTripAdvisorPlace,
  onToggleExpanded,
}: LocationCompletenessSummaryProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <CompletenessStatus isComplete={isComplete} missingCount={missingFields.length} />
        <div className="flex items-center gap-1.5 shrink-0">
          {shouldShowTripAdvisorButton && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
              onClick={onFetchTripAdvisorPlace}
              disabled={isFetchingTripAdvisorPlace}
              title="Fetch TripAdvisor place data from SerpAPI"
            >
              {isFetchingTripAdvisorPlace ? (
                <Loader2 className="h-3.5 w-3.5 mr-0.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-0.5" />
              )}
              {hasTripAdvisorPlaceData ? "Refetch place data" : "Fetch place data"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-muted-foreground hover:text-foreground"
            onClick={onToggleExpanded}
            aria-expanded={isExpanded}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5 mr-0.5" />
                Hide
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5 mr-0.5" />
                Expand
              </>
            )}
          </Button>
        </div>
      </div>

      {isExpanded && (
        <>
          {!isComplete && (
            <div className="flex flex-wrap gap-1">
              {missingFields.map((field) => (
                <MissingFieldPill key={field.key} field={field} onEditField={onEditField} />
              ))}
            </div>
          )}
          {missingImportantOptionalFields.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Important optional
              </span>
              {missingImportantOptionalFields.map((field) => (
                <MissingOptionalFieldPill key={field.key} field={field} onEditField={onEditField} />
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {requiredFields.map((field) => (
              <CompletenessFieldButton
                key={field.key}
                field={field}
                missingClassName="border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                onEditField={onEditField}
              />
            ))}
            {importantOptionalFields.map((field) => (
              <CompletenessFieldButton
                key={field.key}
                field={field}
                missingClassName="border-muted-foreground/20 bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                onEditField={onEditField}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function CompletenessStatus({
  isComplete,
  missingCount,
}: {
  isComplete: boolean;
  missingCount: number;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className={`text-xs font-semibold px-2 py-1 rounded shrink-0 ${
          isComplete
            ? "bg-emerald-500/15 text-emerald-400"
            : "bg-amber-500/15 text-amber-400"
        }`}
      >
        {isComplete ? "Complete" : "Missing data"}
      </span>
      <span className="text-xs text-muted-foreground truncate">
        {isComplete
          ? "All required fields present"
          : `${missingCount} required field${missingCount === 1 ? "" : "s"} missing`}
      </span>
    </div>
  );
}

function MissingFieldPill({
  field,
  onEditField,
}: {
  field: CompletenessField;
  onEditField: (field: CompletenessField) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onEditField(field)}
      className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
      title={`Click to edit ${field.label}`}
    >
      {field.label}
    </button>
  );
}

function MissingOptionalFieldPill({
  field,
  onEditField,
}: {
  field: CompletenessField;
  onEditField: (field: CompletenessField) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onEditField(field)}
      className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-muted-foreground/20 bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors cursor-pointer"
      title={`Click to edit ${field.label}`}
    >
      Missing {field.label}
    </button>
  );
}

function CompletenessFieldButton({
  field,
  missingClassName,
  onEditField,
}: {
  field: CompletenessField;
  missingClassName: string;
  onEditField: (field: CompletenessField) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onEditField(field)}
      title={`Click to edit ${field.label}`}
      className={`flex items-center gap-2 rounded border px-2 py-1 text-xs text-left w-full ${
        field.present
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
          : missingClassName
      } transition-colors cursor-pointer`}
    >
      {field.present ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      <span>{field.label}</span>
    </button>
  );
}
