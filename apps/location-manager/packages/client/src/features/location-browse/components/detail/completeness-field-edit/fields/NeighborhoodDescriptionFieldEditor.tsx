import { Button, Textarea } from "@client/components/ui";
import { Loader2, Sparkles } from "lucide-react";

interface NeighborhoodDescriptionFieldEditorProps {
  value: string;
  canGenerate: boolean;
  locationHierarchyLabel: string | null;
  isPending: boolean;
  isGenerating: boolean;
  onChange: (value: string) => void;
  onGenerate: () => void;
}

export function NeighborhoodDescriptionFieldEditor({
  value,
  canGenerate,
  locationHierarchyLabel,
  isPending,
  isGenerating,
  onChange,
  onGenerate,
}: NeighborhoodDescriptionFieldEditorProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {canGenerate
            ? `AI uses the current district/location context${locationHierarchyLabel ? `: ${locationHierarchyLabel}` : "."}`
            : "Add a district or neighborhood in Location Key to generate an AI draft."}
        </p>
        <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={onGenerate} disabled={isPending || isGenerating || !canGenerate}>
          {isGenerating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
          {value.trim() ? "Regenerate with AI" : "Generate with AI"}
        </Button>
      </div>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder="Describe the neighborhood..." rows={5} className="resize-none" />
    </div>
  );
}
