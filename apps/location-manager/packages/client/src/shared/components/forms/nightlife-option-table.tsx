import { Label } from "@client/components/ui/label";
import type { NightlifeOption } from "@client/shared/constants/nightlife-options";

interface NightlifeSingleOptionTableProps {
  label: string;
  options: NightlifeOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
}

interface NightlifeMultiOptionTableProps {
  label: string;
  options: NightlifeOption[];
  values: string[];
  onToggle: (value: string) => void;
  error?: string;
}

export function NightlifeSingleOptionTable({
  label,
  options,
  value,
  onChange,
  error,
  placeholder = "Select an option",
}: NightlifeSingleOptionTableProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground"
      >
        <option value="">{placeholder}</option>
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
              <th className="text-left px-2 py-1.5 font-medium">Option</th>
              <th className="text-left px-2 py-1.5 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {options.map((option) => (
              <tr
                key={option.value}
                className={value === option.value ? "bg-primary/10" : "border-t border-border"}
              >
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

export function NightlifeMultiOptionTable({
  label,
  options,
  values,
  onToggle,
  error,
}: NightlifeMultiOptionTableProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
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
                <tr
                  key={option.value}
                  className={
                    isChecked ? "bg-primary/10 border-t border-border" : "border-t border-border"
                  }
                >
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
