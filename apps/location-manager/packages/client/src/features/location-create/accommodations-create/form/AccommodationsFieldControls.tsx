import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Label } from "@client/components/ui/label";
import type { AccommodationsOption } from "../../constants/accommodations-options";

interface FieldLabelProps {
  children: string;
  apiFilled?: boolean;
  aiSuggested?: boolean;
  manuallySelected?: boolean;
  canSuggest?: boolean;
  isSuggesting?: boolean;
  onSuggest?: () => void;
}

interface OptionSelectProps extends Omit<FieldLabelProps, "children"> {
  label: string;
  options: AccommodationsOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

interface MultiOptionTableProps extends Omit<FieldLabelProps, "children"> {
  label: string;
  options: AccommodationsOption[];
  values: string[];
  onToggle: (value: string) => void;
  error?: string;
}

interface SectionHeaderProps {
  title: string;
  isComplete?: boolean;
  canSuggestAll?: boolean;
  isSuggestingAll?: boolean;
  onSuggestAll?: () => void;
}

export function ApiFilledBadge() {
  return (
    <span className="inline-flex items-center rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase leading-none tracking-normal text-emerald-500">
      API filled
    </span>
  );
}

export function AiSuggestedBadge() {
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

export function FieldLabel({
  children,
  apiFilled,
  aiSuggested,
  manuallySelected,
  canSuggest,
  isSuggesting,
  onSuggest,
}: FieldLabelProps) {
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

export function OptionSelect({
  label,
  options,
  value,
  onChange,
  error,
  ...labelProps
}: OptionSelectProps) {
  return (
    <div className="space-y-2">
      <FieldLabel {...labelProps}>{label}</FieldLabel>
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

export function MultiOptionTable({
  label,
  options,
  values,
  onToggle,
  error,
  ...labelProps
}: MultiOptionTableProps) {
  return (
    <div className="space-y-2">
      <FieldLabel {...labelProps}>{label}</FieldLabel>
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

export function SectionHeader({
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
