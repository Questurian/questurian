import type { UseFormReturn } from "react-hook-form";
import {
  NightlifeMultiOptionTable,
  NightlifeSingleOptionTable,
} from "@client/shared/components/forms";
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
import type {
  EditNightlifeFormData,
  NightlifeEditMultiField,
} from "../../nightlife-edit.types";

interface EditDetailsSectionsProps {
  form: UseFormReturn<EditNightlifeFormData>;
  onToggleMulti: (field: NightlifeEditMultiField, value: string) => void;
}

const SET_OPTIONS = { shouldValidate: true, shouldDirty: true, shouldTouch: true } as const;

export function EditDetailsSections({ form, onToggleMulti }: EditDetailsSectionsProps) {
  const setSingle = <
    Field extends
      | "clubType"
      | "priceTier"
      | "venueType"
      | "venueSize"
      | "peakHours"
      | "touristPresence"
      | "energyLevel"
      | "vipAndBottleService"
      | "crowdProfile",
  >(
    field: Field,
    value: string
  ) => form.setValue(field, value as never, SET_OPTIONS);

  return (
    <>
      <section className="space-y-4">
        <h2 className="text-xs font-semibold tracking-wide text-foreground">Core</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NightlifeSingleOptionTable
            label="Venue Category"
            options={CLUB_TYPE_OPTIONS}
            value={form.watch("clubType")}
            onChange={(value) => setSingle("clubType", value)}
            error={form.formState.errors.clubType?.message}
          />
        </div>
        <NightlifeMultiOptionTable
          label="Music"
          options={MUSIC_OPTIONS}
          values={form.watch("music")}
          onToggle={(value) => onToggleMulti("music", value)}
          error={form.formState.errors.music?.message as string | undefined}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold tracking-wide text-foreground">The Space</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NightlifeSingleOptionTable label="Price Tier" options={PRICE_TIER_OPTIONS} value={form.watch("priceTier")} onChange={(value) => setSingle("priceTier", value)} error={form.formState.errors.priceTier?.message} />
          <NightlifeSingleOptionTable label="Venue Type" options={VENUE_TYPE_OPTIONS} value={form.watch("venueType")} onChange={(value) => setSingle("venueType", value)} error={form.formState.errors.venueType?.message} />
          <NightlifeSingleOptionTable label="Venue Size" options={VENUE_SIZE_OPTIONS} value={form.watch("venueSize")} onChange={(value) => setSingle("venueSize", value)} error={form.formState.errors.venueSize?.message} />
        </div>
        <NightlifeMultiOptionTable label="Layout" options={SPACE_LAYOUT_OPTIONS} values={form.watch("spaceLayout")} onToggle={(value) => onToggleMulti("spaceLayout", value)} error={form.formState.errors.spaceLayout?.message as string | undefined} />
        <NightlifeMultiOptionTable label="Vibe" options={VIBE_OPTIONS} values={form.watch("vibe")} onToggle={(value) => onToggleMulti("vibe", value)} error={form.formState.errors.vibe?.message as string | undefined} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NightlifeSingleOptionTable label="Peak Hours" options={PEAK_HOURS_OPTIONS} value={form.watch("peakHours")} onChange={(value) => setSingle("peakHours", value)} error={form.formState.errors.peakHours?.message} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold tracking-wide text-foreground">The Scene</h2>
        <NightlifeMultiOptionTable label="Music Format" options={MUSIC_FORMAT_OPTIONS} values={form.watch("musicFormat")} onToggle={(value) => onToggleMulti("musicFormat", value)} error={form.formState.errors.musicFormat?.message as string | undefined} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NightlifeSingleOptionTable label="Tourist Presence" options={TOURIST_PRESENCE_OPTIONS} value={form.watch("touristPresence")} onChange={(value) => setSingle("touristPresence", value)} error={form.formState.errors.touristPresence?.message} />
          <NightlifeSingleOptionTable label="Energy Level" options={ENERGY_LEVEL_OPTIONS} value={form.watch("energyLevel")} onChange={(value) => setSingle("energyLevel", value)} error={form.formState.errors.energyLevel?.message} />
          <NightlifeSingleOptionTable label="VIP & Bottle Service" options={VIP_BOTTLE_SERVICE_OPTIONS} value={form.watch("vipAndBottleService")} onChange={(value) => setSingle("vipAndBottleService", value)} error={form.formState.errors.vipAndBottleService?.message} />
          <NightlifeSingleOptionTable label="Crowd Profile (Age Range)" options={CROWD_PROFILE_OPTIONS} value={form.watch("crowdProfile")} onChange={(value) => setSingle("crowdProfile", value)} error={form.formState.errors.crowdProfile?.message} />
        </div>
        <NightlifeMultiOptionTable label="Dress Code" options={DRESS_CODE_OPTIONS} values={form.watch("dressCode")} onToggle={(value) => onToggleMulti("dressCode", value)} error={form.formState.errors.dressCode?.message as string | undefined} />
      </section>
    </>
  );
}
