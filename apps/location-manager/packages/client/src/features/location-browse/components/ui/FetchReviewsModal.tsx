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
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@client/components/ui/select";
import { Loader2 } from "lucide-react";
import type { FetchReviewsRequest } from "@client/shared/services/api/types";

interface FetchReviewsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFetch: (params: FetchReviewsRequest) => void;
  isPending: boolean;
  locationName?: string;
}

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "most_relevant", label: "Most Relevant" },
  { value: "highest_ranking", label: "Highest Rating" },
  { value: "lowest_ranking", label: "Lowest Rating" },
] as const;

const REGION_OPTIONS = [
  { value: "us", label: "United States" },
  { value: "pe", label: "Peru" },
  { value: "br", label: "Brazil" },
  { value: "mx", label: "Mexico" },
  { value: "es", label: "Spain" },
  { value: "gb", label: "United Kingdom" },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany" },
  { value: "it", label: "Italy" },
  { value: "jp", label: "Japan" },
] as const;

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "ja", label: "Japanese" },
] as const;

export function FetchReviewsModal({
  isOpen,
  onClose,
  onFetch,
  isPending,
  locationName,
}: FetchReviewsModalProps) {
  const [formData, setFormData] = useState<FetchReviewsRequest>({
    limit: 99,
    translate_reviews: true,
    sort_by: "newest",
    region: "pe",
    language: "en",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onFetch(formData);
  }

  function handleChange(field: keyof FetchReviewsRequest, value: FetchReviewsRequest[keyof FetchReviewsRequest]) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Fetch Google Reviews</DialogTitle>
          <DialogDescription>
            {locationName
              ? `Fetch reviews for "${locationName}" from Google`
              : "Configure the review fetch parameters"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Limit */}
            <div className="space-y-2">
              <Label htmlFor="limit">Limit (1-100)</Label>
              <Input
                id="limit"
                type="number"
                min={1}
                max={100}
                value={formData.limit}
                onChange={(e) =>
                  handleChange("limit", parseInt(e.target.value) || 20)
                }
              />
            </div>

            {/* Sort By */}
            <div className="space-y-2">
              <Label htmlFor="sort_by">Sort By</Label>
              <Select
                value={formData.sort_by}
                onValueChange={(value) => handleChange("sort_by", value)}
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

            {/* Region */}
            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <Select
                value={formData.region}
                onValueChange={(value) => handleChange("region", value)}
              >
                <SelectTrigger id="region">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {REGION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <Select
                value={formData.language}
                onValueChange={(value) => handleChange("language", value)}
              >
                <SelectTrigger id="language">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Translate Reviews Checkbox */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="translate_reviews"
              checked={formData.translate_reviews}
              onChange={(e) =>
                handleChange("translate_reviews", e.target.checked)
              }
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="translate_reviews" className="cursor-pointer">
              Translate reviews to selected language
            </Label>
          </div>

          {/* Query Filter (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="query">
              Filter by keyword <span className="text-gray-400">(optional)</span>
            </Label>
            <Input
              id="query"
              type="text"
              placeholder="e.g., 'food', 'service', 'atmosphere'"
              value={formData.query || ""}
              onChange={(e) => handleChange("query", e.target.value || undefined)}
            />
          </div>

          {/* Fields Filter (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="fields">
              Fields to include <span className="text-gray-400">(optional)</span>
            </Label>
            <Input
              id="fields"
              type="text"
              placeholder="e.g., 'review_id,review_text,rating'"
              value={formData.fields || ""}
              onChange={(e) => handleChange("fields", e.target.value || undefined)}
            />
            <p className="text-xs text-gray-500">
              Comma-separated list of fields. Leave empty for all fields.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending ? "Fetching..." : "Fetch Reviews"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
