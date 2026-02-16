import { Check } from "lucide-react";

interface SuccessPhaseProps {
  locationTitle: string;
  onAddAnother: () => void;
  onDone: () => void;
}

export function SuccessPhase({ locationTitle, onAddAnother, onDone }: SuccessPhaseProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl bg-card border border-border rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
            <Check className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-[24px]! opacity-70 font-medium text-foreground">Location Added Successfully</h1>
        </div>

        <div className="mb-6 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
          <p className="text-sm text-emerald-400">
            Location "{locationTitle}" has been added successfully!
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={onAddAnother}
            className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-normal"
          >
            Add Another Location
          </button>

          <button
            onClick={onDone}
            className="w-full h-10 bg-muted text-muted-foreground hover:bg-muted/90 rounded-md text-sm font-normal"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
