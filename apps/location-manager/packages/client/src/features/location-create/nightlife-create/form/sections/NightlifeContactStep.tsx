import { useState } from "react";
import { Clock } from "lucide-react";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Button } from "@client/components/ui/button";
import { BookingUrlSuggestRow } from "../../../components/BookingUrlSuggestRow";
import { OperationHoursModal } from "../../../components/OperationHoursModal";
import { DAYTIME_RESTAURANT_OPTIONS } from "../../../constants/nightlife-options";
import { useNightlifeForm } from "../NightlifeFormContext";
import { NightlifeSectionHeader } from "../NightlifeFieldControls";

export function NightlifeContactStep() {
  const {
    activeSection,
    bookingUrlAcked,
    contactComplete,
    form,
    goToPreviousSection,
    isPending,
    isPrefillReady,
    setBookingUrlAcked,
  } = useNightlifeForm();
  const [operationHoursModalOpen, setOperationHoursModalOpen] = useState(false);
  if (!isPrefillReady || activeSection !== "contact") return null;

  return <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
    <NightlifeSectionHeader title="Contact & Access" isComplete={contactComplete} />
    <div className="space-y-2 max-w-xs">
      <Label>Country (Phone Region)</Label>
      <select value={form.watch("countryCode")} onChange={(event) => form.setValue("countryCode", event.target.value as Parameters<typeof form.setValue<"countryCode">>[1], { shouldValidate: true })} className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground">
        <option value="PE">Peru (PE)</option><option value="CO">Colombia (CO)</option><option value="BR">Brazil (BR)</option><option value="MX">Mexico (MX)</option><option value="AR">Argentina (AR)</option><option value="CL">Chile (CL)</option>
      </select>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2"><Label>Phone Number (Public)</Label><Input placeholder="+1 (555) 234-5678" disabled={form.watch("phoneNotAvailable")} {...form.register("phone")} /><label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={form.watch("phoneNotAvailable")} onChange={(event) => { const checked = event.target.checked; form.setValue("phoneNotAvailable", checked, { shouldValidate: true, shouldDirty: true }); if (checked) form.setValue("phone", "", { shouldValidate: true, shouldDirty: true }); }} />Phone not available</label>{form.formState.errors.phone && <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>}</div>
      <div className="space-y-2"><Label>Operating Hours</Label><div className="flex items-center gap-2 flex-wrap"><Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setOperationHoursModalOpen(true)}><Clock className="h-4 w-4" />{form.watch("hours") ? "Edit schedule" : "Set schedule"}</Button>{form.watch("hours") && <span className="text-xs text-muted-foreground">Schedule configured - open modal to edit</span>}</div>
        {operationHoursModalOpen && <OperationHoursModal open={operationHoursModalOpen} onOpenChange={setOperationHoursModalOpen} value={form.watch("hours") ?? ""} onSave={(json) => form.setValue("hours", json, { shouldDirty: true, shouldValidate: true, shouldTouch: true })} />}
      </div>
      <div className="space-y-2"><Label>Official Website</Label><Input placeholder="https://example.com/nebula" {...form.register("website")} />{form.formState.errors.website && <p className="text-xs text-destructive">{form.formState.errors.website.message}</p>}</div>
      <BookingUrlSuggestRow form={form} category="nightlife" label="Reservation URL" fieldName="bookingUrl" onAckChange={setBookingUrlAcked} />
      {form.formState.errors.bookingUrl && <p className="text-xs text-destructive">{form.formState.errors.bookingUrl.message}</p>}
      <div className="space-y-2 md:col-span-2"><Label>TripAdvisor URL (Optional)</Label><Input placeholder="https://www.tripadvisor.com/..." {...form.register("tripadvisorUrl")} /><p className="text-xs text-muted-foreground">Used to extract the TripAdvisor location ID. If TripAdvisor returns hours after create, it will replace the saved schedule.</p>{form.formState.errors.tripadvisorUrl && <p className="text-xs text-destructive">{form.formState.errors.tripadvisorUrl.message}</p>}</div>
    </div>
    <div className="space-y-2">
      <Label>Daytime Restaurant Service</Label>
      <select value={form.watch("daytimeRestaurant")} onChange={(event) => form.setValue("daytimeRestaurant", event.target.value as Parameters<typeof form.setValue<"daytimeRestaurant">>[1], { shouldValidate: true })} className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground">
        {DAYTIME_RESTAURANT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <div className="rounded-md border border-border overflow-hidden"><table className="w-full text-xs"><thead className="bg-muted/40"><tr><th className="text-left px-2 py-1.5 font-medium">Option Label</th><th className="text-left px-2 py-1.5 font-medium">What This Means</th></tr></thead><tbody>{DAYTIME_RESTAURANT_OPTIONS.map((option) => <tr key={option.value} className={form.watch("daytimeRestaurant") === option.value ? "bg-primary/10 border-t border-border" : "border-t border-border"}><td className="px-2 py-1.5 font-medium">{option.label}</td><td className="px-2 py-1.5 text-muted-foreground">{option.description}</td></tr>)}</tbody></table></div>
      {form.formState.errors.daytimeRestaurant && <p className="text-xs text-destructive">{form.formState.errors.daytimeRestaurant.message}</p>}
    </div>
    <div className="flex justify-between border-t border-border/70 pt-4">
      <Button type="button" variant="outline" onClick={goToPreviousSection}>Previous</Button>
      <Button type="submit" disabled={!isPrefillReady || !form.formState.isValid || isPending || !bookingUrlAcked} title={!bookingUrlAcked ? "Verify the AI-suggested Reservation URL or clear it before creating." : undefined}>{isPending ? "Creating..." : "Create Nightlife Document"}</Button>
    </div>
  </section>;
}
