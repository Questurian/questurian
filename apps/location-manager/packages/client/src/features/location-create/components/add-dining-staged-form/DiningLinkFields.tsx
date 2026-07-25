import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { AiStatusBadge } from "../AiStatusBadge";
import { ProvenanceBadge } from "../ProvenanceBadge";
import type { DiningReviewFieldsProps } from "./add-dining-staged-form.types";

export function DiningLinkFields({
  form,
  provenance,
  verifiedAiUrls,
  onAcknowledgeAiUrl,
  aiFieldStatus,
  onRetryAiField,
}: DiningReviewFieldsProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold tracking-tight text-foreground">Links</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="inline-flex items-center gap-2">
            Menu URL
            <ProvenanceBadge provenance={provenance.menuUrl} />
            <AiStatusBadge
              fieldKey="menuUrl"
              fieldLabel="Menu URL"
              status={aiFieldStatus.menuUrl}
              onRetry={onRetryAiField}
            />
          </Label>
          <Input placeholder="https://example.com/menu" {...form.register("menuUrl")} />
          {form.formState.errors.menuUrl && (
            <p className="text-xs text-destructive">{form.formState.errors.menuUrl.message}</p>
          )}
          {provenance.menuUrl === "ai" && form.watch("menuUrl") && (
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-border accent-foreground"
                checked={verifiedAiUrls.menuUrl}
                onChange={(event) => onAcknowledgeAiUrl("menuUrl", event.target.checked)}
              />
              I opened the link and verified it works (required before Create).
            </label>
          )}
        </div>

        <div className="space-y-2">
          <Label className="inline-flex items-center gap-2">
            Reservation URL
            <ProvenanceBadge provenance={provenance.bookingUrl} />
            <AiStatusBadge
              fieldKey="bookingUrl"
              fieldLabel="Reservation URL"
              status={aiFieldStatus.bookingUrl}
              onRetry={onRetryAiField}
            />
          </Label>
          <Input placeholder="https://example.com/reservations" {...form.register("bookingUrl")} />
          {form.formState.errors.bookingUrl && (
            <p className="text-xs text-destructive">{form.formState.errors.bookingUrl.message}</p>
          )}
          {provenance.bookingUrl === "ai" && form.watch("bookingUrl") && (
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-border accent-foreground"
                checked={verifiedAiUrls.bookingUrl}
                onChange={(event) => onAcknowledgeAiUrl("bookingUrl", event.target.checked)}
              />
              I opened the link and verified it works (required before Create).
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
