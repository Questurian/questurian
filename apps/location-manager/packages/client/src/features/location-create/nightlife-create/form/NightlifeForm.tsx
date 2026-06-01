import { NightlifeContactStep } from "./sections/NightlifeContactStep";
import { NightlifeDetailsSteps } from "./sections/NightlifeDetailsSteps";
import { NightlifeLookupSteps } from "./sections/NightlifeLookupSteps";
import type { NightlifeFormProps } from "./nightlife-form.types";

export function NightlifeFormSections(props: NightlifeFormProps) {
  return (
    <form onSubmit={props.form.handleSubmit(props.onSubmit, props.onInvalidSubmit)} className="space-y-5">
      <NightlifeLookupSteps {...props} />
      <NightlifeDetailsSteps {...props} />
      <NightlifeContactStep {...props} />
      {props.error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Error: {props.error.message}</div>}
    </form>
  );
}
