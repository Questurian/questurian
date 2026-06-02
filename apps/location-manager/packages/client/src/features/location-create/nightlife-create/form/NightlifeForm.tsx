import { NightlifeContactStep } from "./sections/NightlifeContactStep";
import { NightlifeDetailsSteps } from "./sections/NightlifeDetailsSteps";
import { NightlifeLookupSteps } from "./sections/NightlifeLookupSteps";
import { useNightlifeForm } from "./NightlifeFormContext";

export function NightlifeFormSections() {
  const { error, form, onInvalidSubmit, onSubmit } = useNightlifeForm();
  return (
    <form onSubmit={form.handleSubmit(onSubmit, onInvalidSubmit)} className="space-y-5">
      <NightlifeLookupSteps />
      <NightlifeDetailsSteps />
      <NightlifeContactStep />
      {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Error: {error.message}</div>}
    </form>
  );
}
