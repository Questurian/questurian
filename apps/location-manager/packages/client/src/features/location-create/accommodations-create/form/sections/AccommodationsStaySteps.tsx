import {
  BOOLEAN_OPTIONS, GYM_OPTIONS, JACUZZI_OPTIONS, PARKING_OPTIONS, PERFECT_FOR_OPTIONS,
  POOL_OPTIONS, VIBE_OPTIONS, WORKSPACE_OPTIONS,
} from "../../../constants/accommodations-options";
import { Button } from "@client/components/ui/button";
import type { AddAccommodationsFormData } from "../../../validation/add-accommodations.schema";
import { EXPERIENCE_SUGGESTION_FIELDS, STAY_SUGGESTION_FIELDS } from "../../suggestions/accommodations-suggestion-utils";
import { MultiOptionTable, OptionSelect, SectionHeader } from "../AccommodationsFieldControls";
import type { AccommodationsFormSectionsProps } from "../AccommodationsForm";

export function AccommodationsStaySteps(props: AccommodationsFormSectionsProps) {
  const {
    activeSection, experienceComplete, form, getCanSuggestField, goToNextSection,
    goToPreviousSection, isAiSuggested, isApiFilled, isManuallySelected, isPrefillReady,
    isSectionPending, pendingFields, queueSuggestion, setSingleOptionField, stayComplete,
    suggestAllFields, toggleMultiOption,
  } = props;

  return <>
      {isPrefillReady && activeSection === "stay" && (
        <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
          <SectionHeader
            title="The Stay"
            isComplete={stayComplete}
            canSuggestAll={STAY_SUGGESTION_FIELDS.some((f) => getCanSuggestField(f))}
            isSuggestingAll={isSectionPending(STAY_SUGGESTION_FIELDS)}
            onSuggestAll={() => suggestAllFields(STAY_SUGGESTION_FIELDS)}
          />
          <MultiOptionTable
            label="Perfect For"
            options={PERFECT_FOR_OPTIONS}
            values={form.watch("perfectFor")}
            onToggle={(value) => toggleMultiOption("perfectFor", value)}
            error={form.formState.errors.perfectFor?.message}
            apiFilled={isApiFilled("perfectFor")}
            aiSuggested={isAiSuggested("perfectFor")}
            manuallySelected={isManuallySelected("perfectFor")}
            canSuggest={getCanSuggestField("perfectFor")}
            isSuggesting={pendingFields.has("perfectFor")}
            onSuggest={() => void queueSuggestion("perfectFor")}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <OptionSelect
              label="Kid Friendly"
              options={BOOLEAN_OPTIONS}
              value={form.watch("kidFriendly")}
              onChange={(value) =>
                setSingleOptionField("kidFriendly", value as AddAccommodationsFormData["kidFriendly"])
              }
              error={form.formState.errors.kidFriendly?.message}
              aiSuggested={isAiSuggested("kidFriendly")}
              manuallySelected={isManuallySelected("kidFriendly")}
              canSuggest={getCanSuggestField("kidFriendly")}
              isSuggesting={pendingFields.has("kidFriendly")}
              onSuggest={() => void queueSuggestion("kidFriendly")}
            />
            <OptionSelect
              label="AC"
              options={BOOLEAN_OPTIONS}
              value={form.watch("ac")}
              onChange={(value) =>
                setSingleOptionField("ac", value as AddAccommodationsFormData["ac"])
              }
              error={form.formState.errors.ac?.message}
              apiFilled={isApiFilled("ac")}
              aiSuggested={isAiSuggested("ac")}
              manuallySelected={isManuallySelected("ac")}
              canSuggest={getCanSuggestField("ac")}
              isSuggesting={pendingFields.has("ac")}
              onSuggest={() => void queueSuggestion("ac")}
            />
            <OptionSelect
              label="WiFi"
              options={BOOLEAN_OPTIONS}
              value={form.watch("wifi")}
              onChange={(value) =>
                setSingleOptionField("wifi", value as AddAccommodationsFormData["wifi"])
              }
              error={form.formState.errors.wifi?.message}
              apiFilled={isApiFilled("wifi")}
              aiSuggested={isAiSuggested("wifi")}
              manuallySelected={isManuallySelected("wifi")}
              canSuggest={getCanSuggestField("wifi")}
              isSuggesting={pendingFields.has("wifi")}
              onSuggest={() => void queueSuggestion("wifi")}
            />
            <OptionSelect
              label="Extra Adult Guest Fee"
              options={BOOLEAN_OPTIONS}
              value={form.watch("extraGuestFee")}
              onChange={(value) =>
                setSingleOptionField("extraGuestFee", value as AddAccommodationsFormData["extraGuestFee"])
              }
              error={form.formState.errors.extraGuestFee?.message}
              aiSuggested={isAiSuggested("extraGuestFee")}
              manuallySelected={isManuallySelected("extraGuestFee")}
              canSuggest={getCanSuggestField("extraGuestFee")}
              isSuggesting={pendingFields.has("extraGuestFee")}
              onSuggest={() => void queueSuggestion("extraGuestFee")}
            />
          </div>
          <MultiOptionTable
            label="Parking"
            options={PARKING_OPTIONS}
            values={form.watch("parking")}
            onToggle={(value) => toggleMultiOption("parking", value)}
            error={form.formState.errors.parking?.message}
            apiFilled={isApiFilled("parking")}
            aiSuggested={isAiSuggested("parking")}
            manuallySelected={isManuallySelected("parking")}
            canSuggest={getCanSuggestField("parking")}
            isSuggesting={pendingFields.has("parking")}
            onSuggest={() => void queueSuggestion("parking")}
          />
          <OptionSelect
            label="Breakfast Served"
            options={BOOLEAN_OPTIONS}
            value={form.watch("breakfastServed")}
            onChange={(value) =>
              setSingleOptionField("breakfastServed", value as AddAccommodationsFormData["breakfastServed"])
            }
            error={form.formState.errors.breakfastServed?.message}
            aiSuggested={isAiSuggested("breakfastServed")}
            manuallySelected={isManuallySelected("breakfastServed")}
            canSuggest={getCanSuggestField("breakfastServed")}
            isSuggesting={pendingFields.has("breakfastServed")}
            onSuggest={() => void queueSuggestion("breakfastServed")}
          />
          <div className="flex justify-between border-t border-border/70 pt-4">
            <Button type="button" variant="outline" onClick={goToPreviousSection}>
              Previous
            </Button>
            <Button type="button" onClick={goToNextSection}>
              Next
            </Button>
          </div>
        </section>
      )}

      {isPrefillReady && activeSection === "experience" && (
        <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
          <SectionHeader
            title="The Experience"
            isComplete={experienceComplete}
            canSuggestAll={EXPERIENCE_SUGGESTION_FIELDS.some((f) => getCanSuggestField(f))}
            isSuggestingAll={isSectionPending(EXPERIENCE_SUGGESTION_FIELDS)}
            onSuggestAll={() => suggestAllFields(EXPERIENCE_SUGGESTION_FIELDS)}
          />
          <MultiOptionTable
            label="Vibe"
            options={VIBE_OPTIONS}
            values={form.watch("vibe")}
            onToggle={(value) => toggleMultiOption("vibe", value)}
            error={form.formState.errors.vibe?.message}
            aiSuggested={isAiSuggested("vibe")}
            manuallySelected={isManuallySelected("vibe")}
            canSuggest={getCanSuggestField("vibe")}
            isSuggesting={pendingFields.has("vibe")}
            onSuggest={() => void queueSuggestion("vibe")}
          />
          <MultiOptionTable
            label="Workspace"
            options={WORKSPACE_OPTIONS}
            values={form.watch("workspace")}
            onToggle={(value) => toggleMultiOption("workspace", value)}
            error={form.formState.errors.workspace?.message}
            aiSuggested={isAiSuggested("workspace")}
            manuallySelected={isManuallySelected("workspace")}
            canSuggest={getCanSuggestField("workspace")}
            isSuggesting={pendingFields.has("workspace")}
            onSuggest={() => void queueSuggestion("workspace")}
          />
          <OptionSelect
            label="Restaurant"
            options={BOOLEAN_OPTIONS}
            value={form.watch("restaurant")}
            onChange={(value) =>
              setSingleOptionField("restaurant", value as AddAccommodationsFormData["restaurant"])
            }
            error={form.formState.errors.restaurant?.message}
            aiSuggested={isAiSuggested("restaurant")}
            manuallySelected={isManuallySelected("restaurant")}
            canSuggest={getCanSuggestField("restaurant")}
            isSuggesting={pendingFields.has("restaurant")}
            onSuggest={() => void queueSuggestion("restaurant")}
          />
          <MultiOptionTable
            label="Pool"
            options={POOL_OPTIONS}
            values={form.watch("pool")}
            onToggle={(value) => toggleMultiOption("pool", value)}
            error={form.formState.errors.pool?.message}
            apiFilled={isApiFilled("pool")}
            aiSuggested={isAiSuggested("pool")}
            manuallySelected={isManuallySelected("pool")}
            canSuggest={getCanSuggestField("pool")}
            isSuggesting={pendingFields.has("pool")}
            onSuggest={() => void queueSuggestion("pool")}
          />
          <OptionSelect
            label="Rooftop Lounge"
            options={BOOLEAN_OPTIONS}
            value={form.watch("rooftopLounge")}
            onChange={(value) =>
              setSingleOptionField("rooftopLounge", value as AddAccommodationsFormData["rooftopLounge"])
            }
            error={form.formState.errors.rooftopLounge?.message}
            aiSuggested={isAiSuggested("rooftopLounge")}
            manuallySelected={isManuallySelected("rooftopLounge")}
            canSuggest={getCanSuggestField("rooftopLounge")}
            isSuggesting={pendingFields.has("rooftopLounge")}
            onSuggest={() => void queueSuggestion("rooftopLounge")}
          />
          <MultiOptionTable
            label="Jacuzzi"
            options={JACUZZI_OPTIONS}
            values={form.watch("jacuzzi")}
            onToggle={(value) => toggleMultiOption("jacuzzi", value)}
            error={form.formState.errors.jacuzzi?.message}
            aiSuggested={isAiSuggested("jacuzzi")}
            manuallySelected={isManuallySelected("jacuzzi")}
            canSuggest={getCanSuggestField("jacuzzi")}
            isSuggesting={pendingFields.has("jacuzzi")}
            onSuggest={() => void queueSuggestion("jacuzzi")}
          />
          <OptionSelect
            label="Gym"
            options={GYM_OPTIONS}
            value={form.watch("gym")}
            onChange={(value) =>
              setSingleOptionField("gym", value as AddAccommodationsFormData["gym"])
            }
            error={form.formState.errors.gym?.message}
            aiSuggested={isAiSuggested("gym")}
            manuallySelected={isManuallySelected("gym")}
            canSuggest={getCanSuggestField("gym")}
            isSuggesting={pendingFields.has("gym")}
            onSuggest={() => void queueSuggestion("gym")}
          />
          <div className="flex justify-between border-t border-border/70 pt-4">
            <Button type="button" variant="outline" onClick={goToPreviousSection}>
              Previous
            </Button>
            <Button type="button" onClick={goToNextSection}>
              Next
            </Button>
          </div>
        </section>
      )}

  </>;
}
