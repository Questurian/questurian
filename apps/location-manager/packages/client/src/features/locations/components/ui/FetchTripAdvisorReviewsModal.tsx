import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@client/components/ui/dialog";
import { Button } from "@client/components/ui/button";
import { Label } from "@client/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@client/components/ui/select";
import { Loader2, X } from "lucide-react";
import type { FetchTripAdvisorReviewsRequest } from "@client/shared/services/api/types";

interface FetchTripAdvisorReviewsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFetch: (params: FetchTripAdvisorReviewsRequest) => void;
  isPending: boolean;
  locationName?: string;
}

const SORT_OPTIONS = [
  { value: "most_recent", label: "Most Recent" },
  { value: "detailed_reviews", label: "Detailed Reviews" },
] as const;

const LOCALE_OPTIONS = [
  { value: "en-US", label: "English (US)" },
  { value: "es-ES", label: "Spanish (Spain)" },
  { value: "es-MX", label: "Spanish (Mexico)" },
  { value: "es-PE", label: "Spanish (Peru)" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "fr-FR", label: "French (France)" },
  { value: "de-DE", label: "German (Germany)" },
  { value: "it-IT", label: "Italian (Italy)" },
  { value: "ja-JP", label: "Japanese (Japan)" },
  { value: "ko-KR", label: "Korean (Korea)" },
  { value: "zh-Hans-US", label: "Chinese (Simplified)" },
  { value: "zh-Hant-TW", label: "Chinese (Traditional)" },
] as const;

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
  { value: "ru", label: "Russian" },
  { value: "nl", label: "Dutch" },
  { value: "sv", label: "Swedish" },
  { value: "da", label: "Danish" },
  { value: "nb", label: "Norwegian" },
  { value: "pl", label: "Polish" },
  { value: "tr", label: "Turkish" },
  { value: "th", label: "Thai" },
  { value: "vi", label: "Vietnamese" },
  { value: "id", label: "Indonesian" },
  { value: "ar", label: "Arabic" },
  { value: "he", label: "Hebrew" },
  { value: "el", label: "Greek" },
] as const;

export function FetchTripAdvisorReviewsModal({
  isOpen,
  onClose,
  onFetch,
  isPending,
  locationName,
}: FetchTripAdvisorReviewsModalProps) {
  const [formData, setFormData] = useState<FetchTripAdvisorReviewsRequest>({
    languages: ["en", "es"],
    sort_by: "most_recent",
    locale: "en-US",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (formData.languages.length === 0) {
      return;
    }
    onFetch(formData);
  }

  function handleChange<K extends keyof FetchTripAdvisorReviewsRequest>(
    field: K,
    value: FetchTripAdvisorReviewsRequest[K]
  ) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function handleAddLanguage(lang: string) {
    if (!formData.languages.includes(lang)) {
      handleChange("languages", [...formData.languages, lang]);
    }
  }

  function handleRemoveLanguage(lang: string) {
    if (isPending) return; // Don't allow removal while fetching
    handleChange(
      "languages",
      formData.languages.filter((l) => l !== lang)
    );
  }

  function handleClose() {
    if (isPending) return; // Don't allow closing while fetching
    onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[500px]" onPointerDownOutside={(e) => isPending && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Fetch TripAdvisor Reviews</DialogTitle>
          <DialogDescription>
            {locationName
              ? `Fetch reviews for "${locationName}" from TripAdvisor`
              : "Configure the review fetch parameters"}
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          // Show progress view while fetching
          <div className="py-8 space-y-4">
            <div className="flex flex-col items-center justify-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
              <div className="text-center">
                <p className="text-lg font-medium text-gray-900">Fetching Reviews...</p>
                <p className="text-sm text-gray-500 mt-1">
                  This may take several minutes depending on the number of reviews
                </p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded p-4">
              <p className="text-sm font-medium text-blue-800 mb-2">Languages being fetched:</p>
              <div className="flex flex-wrap gap-2">
                {formData.languages.map((lang) => {
                  const langOption = LANGUAGE_OPTIONS.find((l) => l.value === lang);
                  return (
                    <span
                      key={lang}
                      className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-blue-100 text-blue-800 rounded"
                    >
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {langOption?.label || lang}
                    </span>
                  );
                })}
              </div>
            </div>

            <p className="text-xs text-gray-500 text-center">
              Please wait... The modal will close automatically when complete.
            </p>
          </div>
        ) : (
          // Show form when not fetching
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Languages Selection */}
            <div className="space-y-2">
              <Label>Languages to fetch</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {formData.languages.map((lang) => {
                  const langOption = LANGUAGE_OPTIONS.find((l) => l.value === lang);
                  return (
                    <span
                      key={lang}
                      className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-blue-100 text-blue-800 rounded"
                    >
                      {langOption?.label || lang}
                      <button
                        type="button"
                        onClick={() => handleRemoveLanguage(lang)}
                        className="hover:text-blue-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
              <Select onValueChange={handleAddLanguage}>
                <SelectTrigger>
                  <SelectValue placeholder="Add a language..." />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.filter(
                    (opt) => !formData.languages.includes(opt.value)
                  ).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                Each language will be fetched separately. All pages will be retrieved automatically.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Sort By */}
              <div className="space-y-2">
                <Label htmlFor="sort_by">Sort By</Label>
                <Select
                  value={formData.sort_by}
                  onValueChange={(value) =>
                    handleChange("sort_by", value as "most_recent" | "detailed_reviews")
                  }
                >
                  <SelectTrigger id="sort_by">
                    <SelectValue placeholder="Select sort order" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Locale */}
              <div className="space-y-2">
                <Label htmlFor="locale">Locale</Label>
                <Select
                  value={formData.locale}
                  onValueChange={(value) => handleChange("locale", value)}
                >
                  <SelectTrigger id="locale">
                    <SelectValue placeholder="Select locale" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
              <strong>Note:</strong> Fetching reviews may take several minutes as each language
              requires multiple API calls to retrieve all pages of reviews.
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending || formData.languages.length === 0}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isPending ? "Fetching..." : `Fetch Reviews (${formData.languages.length} languages)`}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
