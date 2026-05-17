import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@client/components/ui/dialog";
import { Button } from "@client/components/ui/button";
import { Loader2, CheckCircle, AlertCircle, Languages, FileText } from "lucide-react";
import type { MergedReviewsReportData } from "@client/shared/services/api/types";

interface ReviewsReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  report: MergedReviewsReportData | null | undefined;
  isLoading: boolean;
  error: Error | null;
  locationName?: string;
}

export function ReviewsReportDialog({
  isOpen,
  onClose,
  report,
  isLoading,
  error,
  locationName,
}: ReviewsReportDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Reviews Report</DialogTitle>
          <DialogDescription>
            {locationName
              ? `Pipeline results for "${locationName}"`
              : "Pipeline results"}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : error ? (
          <div className="py-6 text-center">
            <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-red-600">{error.message}</p>
          </div>
        ) : report ? (
          <div className="space-y-4">
            {/* Totals */}
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-medium text-foreground">Review Totals</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Total Reviews:</span>
                  <span className="ml-2 font-semibold">{report.stats.totalReviews}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Google:</span>
                  <span className="ml-2 font-semibold">{report.stats.googleReviews}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">TripAdvisor:</span>
                  <span className="ml-2 font-semibold">{report.stats.tripadvisorReviews}</span>
                </div>
              </div>
            </div>

            {/* Translation */}
            <div className="bg-blue-500/10 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Languages className="h-5 w-5 text-blue-400" />
                <h3 className="font-medium text-foreground">Translation</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Translated:</span>
                  <span className="ml-2 font-semibold text-blue-400">{report.stats.translated}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Already English:</span>
                  <span className="ml-2 font-semibold">{report.stats.alreadyEnglish}</span>
                </div>
                {report.stats.errors > 0 && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Translation Errors:</span>
                    <span className="ml-2 font-semibold text-amber-400">{report.stats.errors}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Rejected reviews */}
            {report.rejectsReport && report.rejectsReport.totalRejected > 0 && (
              <div className="bg-amber-500/10 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="h-5 w-5 text-amber-400" />
                  <h3 className="font-medium text-foreground">Excluded From Merged Dataset</h3>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total Excluded:</span>
                    <span className="ml-2 font-semibold">{report.rejectsReport.totalRejected}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Replaced with English:</span>
                    <span className="ml-2 font-semibold">{report.rejectsReport.replacedWithEnglish}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Duplicate non-English:</span>
                    <span className="ml-2 font-semibold">{report.rejectsReport.rejectedNonEnglish}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Translation failed:</span>
                    <span className="ml-2 font-semibold">{report.rejectsReport.translationFailed}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Duplicate non-English reviews were deduplicated (preferring English versions); translation-failed reviews were dropped to prevent garbled non-English text from leaking into the merged dataset.
                </p>
              </div>
            )}

            {/* Success indicator */}
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="text-sm">
                Merged on {new Date(report.mergedAt).toLocaleString()}
              </span>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-muted-foreground">
            No report data available.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
