import type { Dispatch, SetStateAction } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Clock } from "lucide-react";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Button } from "@client/components/ui/button";
import { OperationHoursModal } from "../OperationHoursModal";
import { BookingUrlSuggestRow } from "../BookingUrlSuggestRow";
import type { AddAttractionsFormData } from "../../validation/add-attractions.schema";
import type { AttractionsFormSection } from "./attractionsForm.types";

type Props = {
  activeSection: AttractionsFormSection;
  form: UseFormReturn<AddAttractionsFormData>;
  isPrefillReady: boolean;
  isCreating: boolean;
  operationHoursModalOpen: boolean;
  setOperationHoursModalOpen: Dispatch<SetStateAction<boolean>>;
  bookingUrlAcked: boolean;
  setBookingUrlAcked: Dispatch<SetStateAction<boolean>>;
  onPrevious: () => void;
};

export function AttractionsVisitContactSection({
  activeSection,
  form,
  isPrefillReady,
  isCreating,
  operationHoursModalOpen,
  setOperationHoursModalOpen,
  bookingUrlAcked,
  setBookingUrlAcked,
  onPrevious: goToPreviousSection,
}: Props) {
  return (
    <>
            {isPrefillReady && activeSection === "visitContact" && (
              <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">Visit & Contact</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Operating Hours</Label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => setOperationHoursModalOpen(true)}
                      >
                        <Clock className="h-4 w-4" />
                        {form.watch("hours") ? "Edit schedule" : "Set schedule"}
                      </Button>
                      {form.watch("hours") && (
                        <span className="text-xs text-muted-foreground">
                          Schedule configured - open modal to edit
                        </span>
                      )}
                    </div>
                    {operationHoursModalOpen && (
                      <OperationHoursModal
                        open={operationHoursModalOpen}
                        onOpenChange={setOperationHoursModalOpen}
                        value={form.watch("hours") ?? ""}
                        onSave={(json) => {
                          form.setValue("hours", json, {
                            shouldDirty: true,
                            shouldValidate: true,
                            shouldTouch: true,
                          });
                        }}
                      />
                    )}
                    {form.formState.errors.hours && (
                      <p className="text-xs text-destructive">{form.formState.errors.hours.message}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Website (optional)</Label>
                    <Input placeholder="https://example.com" {...form.register("website")} />
                    {form.formState.errors.website && (
                      <p className="text-xs text-destructive">{form.formState.errors.website.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Phone (optional)</Label>
                    <Input placeholder="+51 1 461-1312" {...form.register("phone")} />
                    {form.formState.errors.phone && (
                      <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>TripAdvisor URL (optional)</Label>
                  <Input placeholder="https://www.tripadvisor.com/..." {...form.register("tripadvisorUrl")} />
                  {form.formState.errors.tripadvisorUrl && (
                    <p className="text-xs text-destructive">{form.formState.errors.tripadvisorUrl.message}</p>
                  )}
                </div>

                <BookingUrlSuggestRow
                  form={form}
                  category="attractions"
                  label="Tickets URL"
                  fieldName="bookingUrl"
                  onAckChange={setBookingUrlAcked}
                />

                <div className="flex justify-between border-t border-border/70 pt-4">
                  <Button type="button" variant="outline" onClick={goToPreviousSection}>
                    Previous
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      !isPrefillReady ||
                      !form.formState.isValid ||
                      isCreating ||
                      !bookingUrlAcked
                    }
                    title={
                      !bookingUrlAcked
                        ? "Verify the AI-suggested Tickets URL or clear it before creating."
                        : undefined
                    }
                  >
                    {isCreating ? "Creating..." : "Create Attractions Document"}
                  </Button>
                </div>
              </section>
            )}


    </>
  );
}
