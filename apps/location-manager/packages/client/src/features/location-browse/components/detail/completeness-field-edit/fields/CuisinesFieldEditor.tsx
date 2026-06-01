import { Button } from "@client/components/ui";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@client/components/ui/select";
import { X } from "lucide-react";

interface OptionGroup {
  label: string;
  options: string[];
}

interface CuisinesFieldEditorProps {
  value: string[];
  availableOptions: string[];
  availableGroups: OptionGroup[];
  onChange: (value: string[]) => void;
}

export function CuisinesFieldEditor({ value, availableOptions, availableGroups, onChange }: CuisinesFieldEditorProps) {
  return (
    <div className="space-y-3">
      <Select key={`cuisines-${value.join("|") || "empty"}`} value={undefined} onValueChange={(cuisine) => onChange(value.includes(cuisine) ? value : [...value, cuisine])} disabled={availableOptions.length === 0}>
        <SelectTrigger><SelectValue placeholder="Choose cuisines" /></SelectTrigger>
        <SelectContent>
          {availableGroups.map((group, groupIndex) => (
            <SelectGroup key={group.label}>
              <SelectLabel className="pl-2 pr-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">{group.label}</SelectLabel>
              {group.options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
              {groupIndex < availableGroups.length - 1 && <SelectSeparator />}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {value.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {value.map((cuisine) => (
              <span key={cuisine} className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground">
                {cuisine}
                <button type="button" className="rounded-sm text-muted-foreground hover:text-foreground" onClick={() => onChange(value.filter((item) => item !== cuisine))} aria-label={`Remove ${cuisine}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange([])}>Clear cuisines</Button>
        </div>
      )}
    </div>
  );
}
