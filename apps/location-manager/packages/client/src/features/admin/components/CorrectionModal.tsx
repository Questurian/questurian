import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateTaxonomyCorrection } from "@client/shared/services/api/hooks";
import { taxonomyAdminApi } from "@client/shared/services/api/taxonomy-admin.api";
import { Button } from "@client/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from "@client/components/ui/alert-dialog";
import { FormInput } from "@client/shared/components/forms";
import { handleSlugifyInput } from "@client/shared/lib/utils";
import type { CorrectionPreview } from "@client/shared/services/api/types";

const KEBAB = /^[a-z0-9-]+$/;
const PARTS = ["country", "city", "neighborhood"] as const;
type PartType = (typeof PARTS)[number];

const PART_LABELS: Record<PartType, string> = {
  country: "Country",
  city: "City",
  neighborhood: "Neighborhood",
};

const partSchema = z.object({
  incorrect_value: z.string(),
  correct_value: z.string(),
});

const correctionSchema = z
  .object({
    country: partSchema,
    city: partSchema,
    neighborhood: partSchema,
  })
  .superRefine((data, ctx) => {
    let hasActive = false;
    for (const part of PARTS) {
      const { incorrect_value, correct_value } = data[part];
      if (!correct_value.trim()) continue;
      if (!KEBAB.test(correct_value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Lowercase with hyphens only",
          path: [part, "correct_value"],
        });
      } else if (correct_value === incorrect_value) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Same as current value",
          path: [part, "correct_value"],
        });
      } else {
        hasActive = true;
      }
    }
    if (!hasActive) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Fill in at least one correct value",
        path: ["city", "correct_value"],
      });
    }
  });

type CorrectionFormData = z.infer<typeof correctionSchema>;

interface AggregatedPreview {
  totalPendingCount: number;
  totalLocationCount: number;
  parts: Array<{
    part_type: PartType;
    incorrect_value: string;
    correct_value: string;
    preview: CorrectionPreview;
  }>;
}

interface CorrectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationKey?: string;
  defaultPartType?: PartType;
}

function extractPart(locationKey: string, part: PartType): string {
  const parts = locationKey.split("|");
  if (part === "country") return parts[0] || "";
  if (part === "city") return parts[1] || "";
  return parts[2] || "";
}

export function CorrectionModal({
  open,
  onOpenChange,
  locationKey,
}: CorrectionModalProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [aggregatedPreview, setAggregatedPreview] =
    useState<AggregatedPreview | null>(null);

  const { control, handleSubmit, reset, getValues, trigger, setValue } =
    useForm<CorrectionFormData>({
      resolver: zodResolver(correctionSchema),
      defaultValues: buildDefaults(locationKey),
    });

  const createMutation = useCreateTaxonomyCorrection();

  useEffect(() => {
    if (!open) return;
    reset(buildDefaults(locationKey));
    setShowPreview(false);
    setAggregatedPreview(null);
  }, [open, locationKey, reset]);

  function buildDefaults(key?: string): CorrectionFormData {
    return {
      country: {
        incorrect_value: key ? extractPart(key, "country") : "",
        correct_value: "",
      },
      city: {
        incorrect_value: key ? extractPart(key, "city") : "",
        correct_value: "",
      },
      neighborhood: {
        incorrect_value: key ? extractPart(key, "neighborhood") : "",
        correct_value: "",
      },
    };
  }

  function getActiveCorrections(values: CorrectionFormData) {
    return PARTS.flatMap((part) => {
      const { incorrect_value, correct_value } = values[part];
      if (
        correct_value.trim() &&
        KEBAB.test(correct_value) &&
        correct_value !== incorrect_value &&
        incorrect_value.trim()
      ) {
        return [{ part_type: part, incorrect_value, correct_value }];
      }
      return [];
    });
  }

  const handlePreview = async () => {
    const isValid = await trigger();
    if (!isValid) return;

    const values = getValues();
    const active = getActiveCorrections(values);
    if (active.length === 0) return;

    setPreviewLoading(true);
    try {
      const previews = await Promise.all(
        active.map(({ incorrect_value, correct_value, part_type }) =>
          taxonomyAdminApi.previewCorrection({
            incorrect_value,
            correct_value,
            part_type,
          })
        )
      );

      const agg: AggregatedPreview = {
        totalPendingCount: previews.reduce(
          (sum, p) => sum + p.pendingTaxonomyCount,
          0
        ),
        totalLocationCount: previews.reduce(
          (sum, p) => sum + p.locationCount,
          0
        ),
        parts: active.map((a, i) => ({ ...a, preview: previews[i] })),
      };

      setAggregatedPreview(agg);
      setShowPreview(true);
    } catch (err) {
      console.error("Preview failed:", err);
      alert("Preview failed. Please try again.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const onSubmit = async (data: CorrectionFormData) => {
    const active = getActiveCorrections(data);
    if (active.length === 0) return;

    try {
      let totalPending = 0;
      let totalLocations = 0;
      for (const correction of active) {
        const result = await createMutation.mutateAsync({
          incorrect_value: correction.incorrect_value,
          correct_value: correction.correct_value,
          part_type: correction.part_type,
        });
        totalPending += result.updatedPendingCount;
        totalLocations += result.updatedLocationCount;
      }
      alert(
        `${active.length} correction${active.length > 1 ? "s" : ""} applied! ` +
          `Updated ${totalPending} pending entries and ${totalLocations} locations.`
      );
      onOpenChange(false);
      reset();
      setShowPreview(false);
      setAggregatedPreview(null);
    } catch (err) {
      console.error("Failed to create corrections:", err);
      alert("Failed to create corrections. Please try again.");
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    reset();
    setShowPreview(false);
    setAggregatedPreview(null);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Create Taxonomy Correction</AlertDialogTitle>
          <AlertDialogDescription>
            Fix malformed location data. Fill in corrections for any parts that
            need fixing — all will be applied at once.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Header row */}
          <div className="grid grid-cols-[80px_1fr_1fr] gap-3 text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
            <span>Part</span>
            <span>Incorrect Value</span>
            <span>Correct Value</span>
          </div>

          {/* One row per part */}
          {PARTS.map((part) => (
            <div
              key={part}
              className="grid grid-cols-[80px_1fr_1fr] gap-3 items-start"
            >
              <span className="pt-8 text-sm font-medium capitalize text-muted-foreground">
                {PART_LABELS[part]}
              </span>
              <FormInput
                name={`${part}.incorrect_value` as const}
                label="Incorrect"
                control={control}
                placeholder={`e.g. bras-lia`}
                onInput={handleSlugifyInput}
              />
              <FormInput
                name={`${part}.correct_value` as const}
                label="Correct"
                control={control}
                placeholder={`e.g. brasilia`}
                onInput={handleSlugifyInput}
              />
            </div>
          ))}

          {/* Preview Section */}
          {showPreview && aggregatedPreview && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <h4 className="font-semibold text-blue-900">Impact Preview</h4>
              <div className="text-sm text-blue-800 space-y-1">
                <p>
                  <strong>{aggregatedPreview.totalPendingCount}</strong> pending
                  entries will be updated
                </p>
                <p>
                  <strong>{aggregatedPreview.totalLocationCount}</strong>{" "}
                  locations will be updated
                </p>
              </div>

              {aggregatedPreview.parts.map(
                ({ part_type, incorrect_value, correct_value, preview }) => (
                  <div
                    key={part_type}
                    className="border-t border-blue-200 pt-3 first:border-0 first:pt-0"
                  >
                    <p className="text-sm font-medium text-blue-900 capitalize mb-1">
                      {PART_LABELS[part_type]}:{" "}
                      <code className="bg-red-100 px-1 rounded">
                        {incorrect_value}
                      </code>{" "}
                      →{" "}
                      <code className="bg-green-100 px-1 rounded">
                        {correct_value}
                      </code>
                    </p>
                    <p className="text-xs text-blue-700">
                      {preview.pendingTaxonomyCount} pending,{" "}
                      {preview.locationCount} locations
                    </p>
                    {preview.locationSamples.length > 0 && (
                      <ul className="list-disc list-inside mt-1 space-y-0.5">
                        {preview.locationSamples.slice(0, 2).map((s) => (
                          <li key={s.id} className="text-xs">
                            {s.name}:{" "}
                            <code className="bg-red-100 px-1 rounded">
                              {s.currentKey}
                            </code>{" "}
                            →{" "}
                            <code className="bg-green-100 px-1 rounded">
                              {s.correctedKey}
                            </code>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleClose}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              onClick={handlePreview}
              disabled={previewLoading}
            >
              {previewLoading ? "Loading..." : "Preview Impact"}
            </Button>
            <Button
              type="submit"
              disabled={!showPreview || createMutation.isPending}
            >
              {createMutation.isPending ? "Applying..." : "Create & Apply"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
