import { CheckCircle2 } from "lucide-react";
import { Label } from "@client/components/ui/label";
import type { NightlifeOption } from "../../constants/nightlife-options";

interface OptionSelectProps {
  label: string;
  options: NightlifeOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function OptionSelect({ label, options, value, onChange, error }: OptionSelectProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/40"><tr><th className="text-left px-2 py-1.5 font-medium">Option Label</th><th className="text-left px-2 py-1.5 font-medium">What This Means</th></tr></thead>
          <tbody>
            {options.map((option) => <tr key={option.value} className={value === option.value ? "bg-primary/10" : "border-t border-border"}><td className="px-2 py-1.5 font-medium">{option.label}</td><td className="px-2 py-1.5 text-muted-foreground">{option.description}</td></tr>)}
          </tbody>
        </table>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

interface MultiOptionTableProps {
  label: string;
  options: NightlifeOption[];
  values: string[];
  onToggle: (value: string) => void;
  error?: string;
}

export function MultiOptionTable({ label, options, values, onToggle, error }: MultiOptionTableProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/40"><tr><th className="text-left px-2 py-1.5 font-medium w-24">Select</th><th className="text-left px-2 py-1.5 font-medium w-44">Option Label</th><th className="text-left px-2 py-1.5 font-medium">What This Means</th></tr></thead>
          <tbody>
            {options.map((option) => {
              const isChecked = values.includes(option.value);
              return <tr key={option.value} className={isChecked ? "bg-primary/10 border-t border-border" : "border-t border-border"}><td className="px-2 py-1.5"><label className="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={isChecked} onChange={() => onToggle(option.value)} /><span className="text-[11px]">{isChecked ? "Selected" : "Select"}</span></label></td><td className="px-2 py-1.5 font-medium">{option.label}</td><td className="px-2 py-1.5 text-muted-foreground">{option.description}</td></tr>;
            })}
          </tbody>
        </table>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function NightlifeSectionHeader({ title, isComplete = false }: { title: string; isComplete?: boolean }) {
  return <div className="flex items-center gap-2"><h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>{isComplete && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />Complete</span>}</div>;
}
