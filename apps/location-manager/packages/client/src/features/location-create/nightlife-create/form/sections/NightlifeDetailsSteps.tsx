import { Button } from "@client/components/ui/button";
import { FormTagMultiSelect } from "@client/shared/components/forms";
import { getIdealForOptionGroups } from "../../../constants/ai-prompt-template";
import {
  CLUB_TYPE_OPTIONS,
  CROWD_PROFILE_OPTIONS,
  DRESS_CODE_OPTIONS,
  ENERGY_LEVEL_OPTIONS,
  MUSIC_FORMAT_OPTIONS,
  MUSIC_OPTIONS,
  PEAK_HOURS_OPTIONS,
  PRICE_TIER_OPTIONS,
  SPACE_LAYOUT_OPTIONS,
  TOURIST_PRESENCE_OPTIONS,
  VENUE_SIZE_OPTIONS,
  VENUE_TYPE_OPTIONS,
  VIP_BOTTLE_SERVICE_OPTIONS,
  VIBE_OPTIONS,
} from "../../../constants/nightlife-options";
import { MultiOptionTable, NightlifeSectionHeader, OptionSelect } from "../NightlifeFieldControls";
import type { NightlifeFormProps } from "../nightlife-form.types";

export function NightlifeDetailsSteps(props: NightlifeFormProps) {
  const { activeSection, coreComplete, form, isPrefillReady, sceneComplete, spaceComplete, toggleMultiOption } = props;
  const select = <Field extends "clubType" | "priceTier" | "venueType" | "venueSize" | "peakHours" | "touristPresence" | "energyLevel" | "vipAndBottleService" | "crowdProfile">(field: Field, value: string) =>
    form.setValue(field, value as Parameters<typeof form.setValue<Field>>[1], { shouldValidate: true });
  return <>
    {isPrefillReady && activeSection === "core" && <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
      <NightlifeSectionHeader title="Core Identity" isComplete={coreComplete} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><OptionSelect label="Venue Category" options={CLUB_TYPE_OPTIONS} value={form.watch("clubType")} onChange={(value) => select("clubType", value)} error={form.formState.errors.clubType?.message} /></div>
      <MultiOptionTable label="Primary Music Genres" options={MUSIC_OPTIONS} values={form.watch("music")} onToggle={(value) => toggleMultiOption("music", value)} error={form.formState.errors.music?.message as string | undefined} />
      <FormTagMultiSelect name="idealFor" label="Ideal For" control={form.control} optionGroups={getIdealForOptionGroups("nightlife")} maxSelections={4} description="Choose 1 to 4 tags" allowDirectTagArrayInput />
      <StepButtons {...props} />
    </section>}
    {isPrefillReady && activeSection === "space" && <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
      <NightlifeSectionHeader title="The Space" isComplete={spaceComplete} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <OptionSelect label="Price Tier (Spend Level)" options={PRICE_TIER_OPTIONS} value={form.watch("priceTier")} onChange={(value) => select("priceTier", value)} error={form.formState.errors.priceTier?.message} />
        <OptionSelect label="Space Type" options={VENUE_TYPE_OPTIONS} value={form.watch("venueType")} onChange={(value) => select("venueType", value)} error={form.formState.errors.venueType?.message} />
        <OptionSelect label="Venue Capacity" options={VENUE_SIZE_OPTIONS} value={form.watch("venueSize")} onChange={(value) => select("venueSize", value)} error={form.formState.errors.venueSize?.message} />
      </div>
      <MultiOptionTable label="Layout & Zones" options={SPACE_LAYOUT_OPTIONS} values={form.watch("spaceLayout")} onToggle={(value) => toggleMultiOption("spaceLayout", value)} error={form.formState.errors.spaceLayout?.message as string | undefined} />
      <MultiOptionTable label="Atmosphere / Vibe" options={VIBE_OPTIONS} values={form.watch("vibe")} onToggle={(value) => toggleMultiOption("vibe", value)} error={form.formState.errors.vibe?.message as string | undefined} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><OptionSelect label="Peak Hours (Busiest Window)" options={PEAK_HOURS_OPTIONS} value={form.watch("peakHours")} onChange={(value) => select("peakHours", value)} error={form.formState.errors.peakHours?.message} /></div>
      <StepButtons {...props} />
    </section>}
    {isPrefillReady && activeSection === "scene" && <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
      <NightlifeSectionHeader title="The Scene" isComplete={sceneComplete} />
      <MultiOptionTable label="DJ / Music Format" options={MUSIC_FORMAT_OPTIONS} values={form.watch("musicFormat")} onToggle={(value) => toggleMultiOption("musicFormat", value)} error={form.formState.errors.musicFormat?.message as string | undefined} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <OptionSelect label="Tourist vs Local Mix" options={TOURIST_PRESENCE_OPTIONS} value={form.watch("touristPresence")} onChange={(value) => select("touristPresence", value)} error={form.formState.errors.touristPresence?.message} />
        <OptionSelect label="Energy Level" options={ENERGY_LEVEL_OPTIONS} value={form.watch("energyLevel")} onChange={(value) => select("energyLevel", value)} error={form.formState.errors.energyLevel?.message} />
        <OptionSelect label="VIP / Bottle Service Availability" options={VIP_BOTTLE_SERVICE_OPTIONS} value={form.watch("vipAndBottleService")} onChange={(value) => select("vipAndBottleService", value)} error={form.formState.errors.vipAndBottleService?.message} />
        <OptionSelect label="Crowd Profile (Age Range)" options={CROWD_PROFILE_OPTIONS} value={form.watch("crowdProfile")} onChange={(value) => select("crowdProfile", value)} error={form.formState.errors.crowdProfile?.message} />
      </div>
      <MultiOptionTable label="Expected Dress Code" options={DRESS_CODE_OPTIONS} values={form.watch("dressCode")} onToggle={(value) => toggleMultiOption("dressCode", value)} error={form.formState.errors.dressCode?.message as string | undefined} />
      <StepButtons {...props} />
    </section>}
  </>;
}

function StepButtons({ goToNextSection, goToPreviousSection }: NightlifeFormProps) {
  return <div className="flex justify-between border-t border-border/70 pt-4"><Button type="button" variant="outline" onClick={goToPreviousSection}>Previous</Button><Button type="button" onClick={() => void goToNextSection()}>Next</Button></div>;
}
