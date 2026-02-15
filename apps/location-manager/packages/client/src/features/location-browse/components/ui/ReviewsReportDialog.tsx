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
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-5 w-5 text-gray-600" />
                <h3 className="font-medium text-gray-900">Review Totals</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Total Reviews:</span>
                  <span className="ml-2 font-semibold">{report.stats.totalReviews}</span>
                </div>
                <div>
                  <span className="text-gray-500">Google:</span>
                  <span className="ml-2 font-semibold">{report.stats.googleReviews}</span>
                </div>
                <div>
                  <span className="text-gray-500">TripAdvisor:</span>
                  <span className="ml-2 font-semibold">{report.stats.tripadvisorReviews}</span>
                </div>
              </div>
            </div>

            {/* Translation */}
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Languages className="h-5 w-5 text-blue-600" />
                <h3 className="font-medium text-gray-900">Translation</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Translated:</span>
                  <span className="ml-2 font-semibold text-blue-700">{report.stats.translated}</span>
                </div>
                <div>
                  <span className="text-gray-500">Already English:</span>
                  <span className="ml-2 font-semibold">{report.stats.alreadyEnglish}</span>
                </div>
                {report.stats.errors > 0 && (
                  <div className="col-span-2">
                    <span className="text-gray-500">Translation Errors:</span>
                    <span className="ml-2 font-semibold text-amber-600">{report.stats.errors}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Duplicates */}
            {report.rejectsReport && report.rejectsReport.totalRejected > 0 && (
              <div className="bg-amber-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  <h3 className="font-medium text-gray-900">Duplicates Removed</h3>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Total Rejected:</span>
                    <span className="ml-2 font-semibold">{report.rejectsReport.totalRejected}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Replaced with English:</span>
                    <span className="ml-2 font-semibold">{report.rejectsReport.replacedWithEnglish}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Duplicate reviews from multiple language files were deduplicated, preferring English versions.
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
          <div className="py-6 text-center text-gray-500">
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
