import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@client/components/ui/select";
import { X } from "lucide-react";

interface OptionGroup {
  label: string;
  tags: string[];
}

interface IdealForFieldEditorProps {
  value: string[];
  availableGroups: OptionGroup[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}

export function IdealForFieldEditor({ value, availableGroups, onAdd, onRemove }: IdealForFieldEditorProps) {
  return (
    <div className="space-y-3">
      <Select key={`ideal-for-${value.join("|") || "empty"}`} value={undefined} onValueChange={onAdd} disabled={value.length >= 4 || availableGroups.length === 0}>
        <SelectTrigger>
          <SelectValue placeholder={value.length >= 4 ? "Maximum 4 tags selected" : "Choose Ideal For tags (1-4)"} />
        </SelectTrigger>
        <SelectContent>
          {availableGroups.map((group, groupIndex) => (
            <SelectGroup key={group.label}>
              <SelectLabel className="pl-2 pr-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">{group.label}</SelectLabel>
              {group.tags.map((tag) => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}
              {groupIndex < availableGroups.length - 1 && <SelectSeparator />}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground">
              {tag}
              <button type="button" className="rounded-sm text-muted-foreground hover:text-foreground" onClick={() => onRemove(tag)} aria-label={`Remove ${tag}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
