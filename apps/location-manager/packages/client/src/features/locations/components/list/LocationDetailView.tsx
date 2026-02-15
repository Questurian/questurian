import { useEffect, useMemo, useState } from "react";
import type { LocationResponse, Upload, ImageMetadata, InstagramEmbed } from "@client/shared/services/api/types";
import type { ImageVariant } from "@questurian/lm-shared";
import { DetailField } from "./DetailField";
import { AddInstagramEmbedForm } from "../forms/AddInstagramEmbedForm";
import { AddUploadFilesForm } from "../forms/AddUploadFilesForm";
import { ImageLightbox } from "../ui/ImageLightbox";
import { ReviewsStatusBadge } from "../ui/ReviewsStatusBadge";
import {
  Button,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@client/components/ui";
import { Check, ChevronDown, ChevronUp, X, Download } from "lucide-react";
import { useToast } from "@client/shared/hooks/useToast";
import { useDeleteUpload } from "@client/shared/services/api/hooks/useDeleteUpload";
import { useDeleteInstagramEmbed } from "@client/shared/services/api/hooks/useDeleteInstagramEmbed";
import { useUpdateLocation } from "@client/shared/services/api/hooks/useUpdateLocation";
import { locationsApi } from "@client/shared/services/api/locations.api";
import { IDEAL_FOR_TAG_GROUPS, type IdealForTag } from "@shared/types/location-ideal-for";

const MAX_IDEAL_FOR_SELECTIONS = 4;
const IDEAL_FOR_TAG_OPTIONS: readonly IdealForTag[] = IDEAL_FOR_TAG_GROUPS.flatMap((group) => group.tags);
const IDEAL_FOR_TAG_BY_NORMALIZED = new Map<string, IdealForTag>(
  IDEAL_FOR_TAG_OPTIONS.map((tag) => [normalizeTagText(tag), tag] as const)
);

interface ParsedIdealForInputSuccess {
  ok: true;
  tags: IdealForTag[];
}

interface ParsedIdealForInputFailure {
  ok: false;
  error: string;
}

type ParsedIdealForInputResult = ParsedIdealForInputSuccess | ParsedIdealForInputFailure;

function normalizeTagText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function stripWrappingQuotes(value: string): string {
  return value.trim().replace(/^['"`]+|['"`]+$/g, "").trim();
}

function tokenizeTagInput(rawInput: string): string[] {
  const trimmed = rawInput.trim();
  if (!trimmed) return [];

  const withoutBrackets =
    trimmed.startsWith("[") && trimmed.endsWith("]")
      ? trimmed.slice(1, -1)
      : trimmed;

  return withoutBrackets
    .split(/[\n,;]+/)
    .map((token) => stripWrappingQuotes(token))
    .filter((token) => token.length > 0);
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previousRow = Array.from({ length: b.length + 1 }, (_, index) => index);
  const currentRow = new Array<number>(b.length + 1).fill(0);

  for (let i = 0; i < a.length; i += 1) {
    currentRow[0] = i + 1;

    for (let j = 0; j < b.length; j += 1) {
      const cost = a[i] === b[j] ? 0 : 1;
      currentRow[j + 1] = Math.min(
        currentRow[j] + 1,
        previousRow[j + 1] + 1,
        previousRow[j] + cost
      );
    }

    for (let j = 0; j < previousRow.length; j += 1) {
      previousRow[j] = currentRow[j];
    }
  }

  return previousRow[b.length];
}

function getClosestTagSuggestion(token: string): string | null {
  const normalizedToken = normalizeTagText(token);
  let bestMatch: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  IDEAL_FOR_TAG_OPTIONS.forEach((option) => {
    const distance = levenshteinDistance(normalizedToken, normalizeTagText(option));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = option;
    }
  });

  const maxDistance = Math.max(2, Math.floor(normalizedToken.length * 0.35));

  return bestDistance <= maxDistance ? bestMatch : null;
}

function parseIdealForDirectInput(rawInput: string): ParsedIdealForInputResult {
  const parsedTokens = tokenizeTagInput(rawInput);

  if (parsedTokens.length === 0) {
    return { ok: false, error: "Enter at least one tag before applying." };
  }

  const resolvedTags: IdealForTag[] = [];
  const unknownTokens: string[] = [];

  parsedTokens.forEach((token) => {
    const resolvedTag = IDEAL_FOR_TAG_BY_NORMALIZED.get(normalizeTagText(token));
    if (resolvedTag) {
      resolvedTags.push(resolvedTag);
    } else {
      unknownTokens.push(token);
    }
  });

  if (unknownTokens.length > 0) {
    const unknownTokenMessage = unknownTokens
      .map((token) => {
        const suggestion = getClosestTagSuggestion(token);
        return suggestion
          ? `"${token}" (did you mean "${suggestion}"?)`
          : `"${token}"`;
      })
      .join(", ");

    return { ok: false, error: `Check spelling for: ${unknownTokenMessage}.` };
  }

  const duplicateTags = resolvedTags.filter(
    (tag, index) => resolvedTags.indexOf(tag) !== index
  );

  if (duplicateTags.length > 0) {
    const uniqueDuplicates = Array.from(new Set(duplicateTags));
    return { ok: false, error: `Remove duplicate tags: ${uniqueDuplicates.join(", ")}.` };
  }

  if (resolvedTags.length > MAX_IDEAL_FOR_SELECTIONS) {
    return {
      ok: false,
      error: `You can only apply up to ${MAX_IDEAL_FOR_SELECTIONS} tags at once.`,
    };
  }

  return { ok: true, tags: resolvedTags };
}

function formatTagsAsArray(tags: readonly IdealForTag[]): string {
  return `[${tags.map((tag) => `"${tag}"`).join(", ")}]`;
}

interface LocationDetailViewProps {
  locationDetail: LocationResponse | null | undefined;
  isLoading: boolean;
  error: Error | null;
  onCopyField: (value: string, e: React.MouseEvent) => void;
}

/**
 * Component for displaying expanded location details
 * Shows core fields, completeness status, Instagram embeds, and uploads
 */
export function LocationDetailView({ locationDetail, isLoading, error, onCopyField }: LocationDetailViewProps) {
  const { showToast } = useToast();
  const { mutate: updateLocation, isPending: isUpdatingLocation } = useUpdateLocation();
  const [lightboxState, setLightboxState] = useState({
    isOpen: false,
    images: [] as string[],
    currentIndex: 0,
    photographerCredit: undefined as string | undefined,
    imageMetadata: undefined as ImageMetadata[] | undefined,
    instagramUrl: undefined as string | undefined,
    embedCode: undefined as string | undefined,
  });

  const deleteMutation = useDeleteUpload({
    locationId: locationDetail?.id || 0,
    onSuccess: () => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast("Upload deleted successfully", centerPosition);
    },
    onError: (error) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(error.message || "Failed to delete upload", centerPosition);
    },
  });

  const deleteInstagramMutation = useDeleteInstagramEmbed({
    locationId: locationDetail?.id || 0,
    onSuccess: () => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast("Instagram embed deleted successfully", centerPosition);
    },
    onError: (error) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(error.message || "Failed to delete Instagram embed", centerPosition);
    },
  });

  const hasIdealFor = Boolean(
    Array.isArray(locationDetail?.idealFor) && locationDetail.idealFor.length > 0
  );
  const [idealForDraft, setIdealForDraft] = useState<IdealForTag[]>([]);
  const [isDirectInputEnabled, setIsDirectInputEnabled] = useState(false);
  const [directInputValue, setDirectInputValue] = useState("");
  const [directInputError, setDirectInputError] = useState<string | null>(null);
  const [directInputFeedback, setDirectInputFeedback] = useState<string | null>(null);

  useEffect(() => {
    // Reset draft whenever the loaded location changes or once tags are saved.
    setIdealForDraft([]);
    setIsDirectInputEnabled(false);
    setDirectInputValue("");
    setDirectInputError(null);
    setDirectInputFeedback(null);
  }, [locationDetail?.id, hasIdealFor]);

  const addIdealForTag = (tag: string) => {
    if (isUpdatingLocation) return;

    setIdealForDraft((prev) => {
      const nextTag = tag as IdealForTag;
      if (prev.includes(nextTag) || prev.length >= MAX_IDEAL_FOR_SELECTIONS) return prev;
      return [...prev, nextTag];
    });
    setDirectInputError(null);
    setDirectInputFeedback(null);
  };

  const removeIdealForTag = (tagToRemove: IdealForTag) => {
    setIdealForDraft((prev) => prev.filter((tag) => tag !== tagToRemove));
    setDirectInputError(null);
    setDirectInputFeedback(null);
  };

  const handleDirectInputToggle = (isEnabled: boolean) => {
    setIsDirectInputEnabled(isEnabled);
    setDirectInputError(null);
    setDirectInputFeedback(null);

    if (isEnabled && directInputValue.trim().length === 0 && idealForDraft.length > 0) {
      setDirectInputValue(formatTagsAsArray(idealForDraft));
    }
  };

  const handleApplyDirectInput = () => {
    const parseResult = parseIdealForDirectInput(directInputValue);

    if (!parseResult.ok) {
      setDirectInputError(parseResult.error);
      setDirectInputFeedback(null);
      return;
    }

    setIdealForDraft(parseResult.tags);
    setDirectInputValue(formatTagsAsArray(parseResult.tags));
    setDirectInputError(null);
    setDirectInputFeedback(
      `Applied ${parseResult.tags.length} tag${parseResult.tags.length === 1 ? "" : "s"}.`
    );
  };

  const submitIdealForTags = () => {
    if (!locationDetail || isUpdatingLocation || idealForDraft.length === 0) return;

    updateLocation(
      {
        id: locationDetail.id,
        data: { idealFor: idealForDraft },
      },
      {
        onSuccess: () => {
          const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
          showToast("Ideal For tags saved", centerPosition);
        },
        onError: (updateError) => {
          const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
          showToast(updateError.message || "Failed to save Ideal For tags", centerPosition);
        },
      }
    );
  };

  const availableIdealForGroups = IDEAL_FOR_TAG_GROUPS.map((group) => ({
    ...group,
    tags: group.tags.filter((tag) => !idealForDraft.includes(tag)),
  })).filter((group) => group.tags.length > 0);

  const requiredFields = useMemo(() => {
    if (!locationDetail) return [];

    const contact = locationDetail.contact || {};
    const source = locationDetail.source || {};
    const hasOperationHours = Boolean(
      locationDetail.operationHours &&
        Object.keys(locationDetail.operationHours).length > 0
    );

    const hasMedia =
      (locationDetail.uploads && locationDetail.uploads.length > 0) ||
      (locationDetail.instagram_embeds && locationDetail.instagram_embeds.length > 0);
    const hasIdealFor = Boolean(Array.isArray(locationDetail.idealFor) && locationDetail.idealFor.length > 0);
    const hasCuisines = Boolean(
      Array.isArray(locationDetail.tripadvisorCuisines) && locationDetail.tripadvisorCuisines.length > 0
    );

    return [
      { key: "title", label: "Title", present: Boolean(locationDetail.title?.trim()) },
      { key: "name", label: "Name", present: Boolean(source.name?.trim()) },
      { key: "sourceAddress", label: "Source Address", present: Boolean(source.address?.trim()) },
      { key: "category", label: "Category", present: Boolean(locationDetail.category) },
      { key: "type", label: "Type", present: Boolean(locationDetail.type?.trim()) },
      { key: "locationKey", label: "Location Key", present: Boolean(locationDetail.locationKey?.trim()) },
      { key: "district", label: "District", present: Boolean(locationDetail.district?.trim()) },
      { key: "slug", label: "Slug", present: Boolean(locationDetail.slug?.trim()) },
      {
        key: "coordinates",
        label: "Coordinates",
        present: locationDetail.coordinates?.lat != null && locationDetail.coordinates?.lng != null,
      },
      {
        key: "ianaTimeId",
        label: "Time Zone (IANA)",
        present: Boolean(locationDetail.ianaTimeId?.trim()),
      },
      { key: "countryCode", label: "Country Code", present: Boolean(contact.countryCode?.trim()) },
      { key: "phone", label: "Phone", present: Boolean(contact.phoneNumber?.trim()) },
      { key: "website", label: "Website", present: Boolean(contact.website?.trim()) },
      { key: "contactAddress", label: "Contact Address", present: Boolean(contact.contactAddress?.trim()) },
      { key: "contactUrl", label: "Google URL", present: Boolean(contact.url?.trim()) },
      {
        key: "neighborhoodDescription",
        label: "Neighborhood",
        present: Boolean(locationDetail.neighborhoodDescription?.trim()),
      },
      { key: "idealFor", label: "Ideal For", present: hasIdealFor },
      { key: "cuisines", label: "Cuisines", present: hasCuisines },
      { key: "priceLevel", label: "Price Level", present: Boolean(locationDetail.priceLevel?.trim()) },
      { key: "operationHours", label: "Hours", present: hasOperationHours },
      { key: "media", label: "Images/Instagram", present: hasMedia },
    ];
  }, [locationDetail]);

  const missingFields = useMemo(
    () => requiredFields.filter((field) => !field.present),
    [requiredFields]
  );
  const isComplete = missingFields.length === 0;

  // Expand when incomplete, collapse when complete; user can override via toggle
  const [completenessExpanded, setCompletenessExpanded] = useState<boolean | undefined>(undefined);
  const isCompletenessExpanded = completenessExpanded ?? !isComplete;

  function handleImageSetClick(upload: Upload) {
    if ('imageSet' in upload && upload.imageSet) {
      const imageSet = upload.imageSet;
      if (imageSet && imageSet.variants) {
        // Extract all variant paths for the lightbox
        const variantPaths = imageSet.variants.map((v: ImageVariant) => v.path);

        // Find the index of the square variant (which is displayed in thumbnails)
        // Variant order: ['thumbnail', 'square', 'wide', 'social', 'editorial', 'portrait', 'hero']
        const squareVariantIndex = imageSet.variants.findIndex(v => v.type === 'square');
        const startIndex = squareVariantIndex >= 0 ? squareVariantIndex : 0;

        setLightboxState({
          isOpen: true,
          images: variantPaths,
          currentIndex: startIndex, // Start with square variant (displayed in thumbnails)
          photographerCredit: imageSet.photographerCredit || undefined,
          imageMetadata: imageSet.variants.map(variant => ({
            width: variant.dimensions.width,
            height: variant.dimensions.height,
            size: variant.size,
            format: variant.format,
          })),
          instagramUrl: undefined,
          embedCode: undefined,
        });
      }
    }
  }

  function handleInstagramImageClick(embed: InstagramEmbed, imageIndex: number) {
    setLightboxState({
      isOpen: true,
      images: embed.images || [],
      currentIndex: imageIndex,
      photographerCredit: embed.username ? `@${embed.username}` : undefined,
      imageMetadata: undefined, // Instagram embeds don't have metadata
      instagramUrl: embed.url,
      embedCode: embed.embed_code,
    });
  }

  function handleLightboxNext() {
    setLightboxState((prev) => ({
      ...prev,
      currentIndex: Math.min(prev.currentIndex + 1, prev.images.length - 1),
    }));
  }

  function handleLightboxPrevious() {
    setLightboxState((prev) => ({
      ...prev,
      currentIndex: Math.max(prev.currentIndex - 1, 0),
    }));
  }

  function handleDeleteUpload(uploadId: number) {
    if (confirm("Are you sure you want to delete this upload?")) {
      deleteMutation.mutate(uploadId);
    }
  }

  function handleDeleteInstagramEmbed(embedId: number) {
    if (confirm("Are you sure you want to delete this Instagram embed?")) {
      deleteInstagramMutation.mutate(embedId);
    }
  }

  if (isLoading) {
    return (
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-sm text-gray-600">Loading details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-sm text-red-600">
          Error loading details: {error.message}
        </p>
      </div>
    );
  }

  if (!locationDetail) {
    return null;
  }

  const sourceAddress = locationDetail.source?.address?.trim();
  const contactAddress = locationDetail.contact?.contactAddress?.trim();
  const showSourceAddress = Boolean(sourceAddress);
  const showContactAddress = Boolean(contactAddress) && contactAddress !== sourceAddress;
  const contactAddressLabel = showSourceAddress ? "Contact Address" : "Address";

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <div className="space-y-3">
        <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`text-xs font-semibold px-2 py-1 rounded shrink-0 ${
                  isComplete
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {isComplete ? "Complete" : "Missing data"}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {isComplete
                  ? "All required fields present"
                  : `${missingFields.length} required field${
                      missingFields.length === 1 ? "" : "s"
                    } missing`}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 h-7 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => setCompletenessExpanded(!isCompletenessExpanded)}
              aria-expanded={isCompletenessExpanded}
            >
              {isCompletenessExpanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5 mr-0.5" />
                  Hide
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5 mr-0.5" />
                  Expand
                </>
              )}
            </Button>
          </div>
          {isCompletenessExpanded && (
            <>
              {!isComplete && (
                <div className="flex flex-wrap gap-1">
                  {missingFields.map((field) => (
                    <span
                      key={field.key}
                      className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700"
                    >
                      {field.label}
                    </span>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {requiredFields.map((field) => (
                  <div
                    key={field.key}
                    className={`flex items-center gap-2 rounded border px-2 py-1 text-xs ${
                      field.present
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {field.present ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    <span>{field.label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Reviews Section - Separate from Completeness */}
        <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Reviews</span>
            <ReviewsStatusBadge
              hasReviews={!!locationDetail.reviewsFetchedAt}
              reviewsCount={locationDetail.reviewsCount}
              reviewsFetchedAt={locationDetail.reviewsFetchedAt}
            />
          </div>
          {locationDetail.reviewsFetchedAt && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Google: {locationDetail.reviewsGoogleCount || 0}</span>
              <span>TripAdvisor: {locationDetail.reviewsTripadvisorCount || 0}</span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  window.open(locationsApi.getMergedReviewsDownloadUrl(locationDetail.id), "_blank");
                }}
              >
                <Download className="h-3 w-3 mr-1" />
                Download
              </Button>
            </div>
          )}
        </div>

        {!hasIdealFor && (
          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
            <span className="text-sm font-medium text-foreground">Set Ideal For</span>
            <Select
              key={`${isUpdatingLocation ? "updating" : "ready"}-${idealForDraft.join("|") || "empty"}`}
              value={undefined}
              onValueChange={addIdealForTag}
              disabled={
                isUpdatingLocation ||
                idealForDraft.length >= MAX_IDEAL_FOR_SELECTIONS ||
                availableIdealForGroups.length === 0
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue
                  placeholder={
                    isUpdatingLocation
                      ? "Saving..."
                      : idealForDraft.length >= MAX_IDEAL_FOR_SELECTIONS
                        ? `Maximum ${MAX_IDEAL_FOR_SELECTIONS} tags selected`
                        : "Choose tags (1-4)"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableIdealForGroups.map((group, groupIndex) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel className="pl-2 pr-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </SelectLabel>
                    {group.tags.map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag}
                      </SelectItem>
                    ))}
                    {groupIndex < availableIdealForGroups.length - 1 && <SelectSeparator />}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>

            <div className="rounded-md border border-dashed border-border/80 bg-background/60 p-3 space-y-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={isDirectInputEnabled}
                  onChange={(event) => handleDirectInputToggle(event.target.checked)}
                />
                Paste an Ideal For array directly
              </label>

              {isDirectInputEnabled && (
                <div className="space-y-2">
                  <Textarea
                    value={directInputValue}
                    onChange={(event) => {
                      setDirectInputValue(event.target.value);
                      setDirectInputError(null);
                      setDirectInputFeedback(null);
                    }}
                    rows={3}
                    placeholder='["Casual Dining", "Coffee & Light Bites"] or Casual Dining, Coffee & Light Bites'
                    aria-invalid={Boolean(directInputError)}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      Brackets are optional. Tags must match the approved names exactly.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleApplyDirectInput}
                      disabled={isUpdatingLocation}
                    >
                      Apply array
                    </Button>
                  </div>
                  {directInputError && (
                    <p className="text-xs font-medium text-destructive">
                      {directInputError}
                    </p>
                  )}
                  {directInputFeedback && !directInputError && (
                    <p className="text-xs font-medium text-green-600">
                      {directInputFeedback}
                    </p>
                  )}
                </div>
              )}
            </div>

            {idealForDraft.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {idealForDraft.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                  >
                    {tag}
                    <button
                      type="button"
                      className="rounded-sm text-muted-foreground hover:text-foreground"
                      onClick={() => removeIdealForTag(tag)}
                      aria-label={`Remove ${tag}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={submitIdealForTags}
                disabled={isUpdatingLocation || idealForDraft.length === 0}
              >
                {isUpdatingLocation ? "Saving..." : "Set Ideal For"}
              </Button>
              {idealForDraft.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIdealForDraft([])}
                  disabled={isUpdatingLocation}
                >
                  Clear
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              {idealForDraft.length}/{MAX_IDEAL_FOR_SELECTIONS} selected. This appears only when no Ideal For tag is set.
            </p>
          </div>
        )}

        {/* Title field - only show if different from source name */}
        {locationDetail.title && locationDetail.title !== locationDetail.source?.name && (
          <DetailField
            label="Title"
            value={locationDetail.title}
          />
        )}

        {showContactAddress && (
          <DetailField
            label={contactAddressLabel}
            value={contactAddress}
            onClick={(e) => onCopyField(contactAddress!, e)}
            title="Click to copy contact address"
          />
        )}


        {/* Existing Uploads Gallery - above add forms */}
        {locationDetail.uploads && locationDetail.uploads.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Uploaded Images:
            </span>
            <ul className="flex gap-2 ml-4 flex-wrap">
              {locationDetail.uploads.map((upload) => {
                // Handle ImageSet format (multi-variant system)
                if (upload.imageSet) {
                  const imageSet = upload.imageSet;
                  // Find square variant (1:1 aspect ratio) for display
                  const squareVariant = imageSet.variants?.find(v => v.type === 'square');
                  if (!squareVariant) return null;

                  const imageUrl = `/api/images/${squareVariant.path.replace(/^data\/images\//, '')}`;
                  return (
                    <li key={`${upload.id}-imageset`} className="relative group">
                      <div className="shrink-0 w-[120px] h-[120px] overflow-hidden rounded bg-gray-100 hover:ring-2 ring-blue-400 transition-all">
                        <img
                          src={imageUrl}
                          alt={imageSet.altText || imageSet.photographerCredit || "Uploaded image"}
                          className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                          loading="lazy"
                          onClick={() => handleImageSetClick(upload)}
                          title={imageSet.photographerCredit || "Click to view all variants"}
                        />
                        </div>
                        {/* Badge showing variant count */}
                        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none">
                          {imageSet.variants?.length || 0} variants
                        </div>
                        {/* Delete button */}
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleDeleteUpload(upload.id!)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </li>
                    );
                }

                return null;
              })}
            </ul>
          </div>
        )}

        {/* Existing Instagram Embeds List - above add forms */}
        {locationDetail.instagram_embeds && locationDetail.instagram_embeds.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Instagram Posts:
            </span>
            <ul className="flex gap-2 ml-4 flex-wrap">
              {locationDetail.instagram_embeds.map((embed) => {
                // Get first image if available
                const firstImage = embed.images?.[0];
                const imageUrl = firstImage
                  ? `/api/images/${firstImage.replace(/^data\/images\//, '')}`
                  : null;

                return (
                  <li key={embed.id} className="relative group">
                    {/* Thumbnail icon */}
                    {imageUrl && (
                      <div className="shrink-0 w-[120px] h-[120px] overflow-hidden rounded bg-gray-100 hover:ring-2 ring-blue-400 transition-all">
                        <img
                          src={imageUrl}
                          alt="Instagram"
                          className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                          loading="lazy"
                          onClick={() => handleInstagramImageClick(embed, 0)}
                          title={embed.username ? `@${embed.username}` : "Click to view"}
                        />
                      </div>
                    )}
                    {/* Delete button */}
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDeleteInstagramEmbed(embed.id!)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Instagram and Upload Forms: Side by side - below existing content */}
        <div className="flex gap-4">
          {/* Instagram Section: Form only */}
          <div className="flex-1">
            <AddInstagramEmbedForm locationId={locationDetail.id} />
          </div>

          {/* Upload Section: Form only */}
          <div className="flex-1">
            <AddUploadFilesForm locationId={locationDetail.id} />
          </div>
        </div>
      </div>

      {/* Image Lightbox */}
      {lightboxState.isOpen && (
        <ImageLightbox
          images={lightboxState.images}
          currentIndex={lightboxState.currentIndex}
          isOpen={lightboxState.isOpen}
          onClose={() => setLightboxState({ ...lightboxState, isOpen: false })}
          onNext={handleLightboxNext}
          onPrevious={handleLightboxPrevious}
          photographerCredit={lightboxState.photographerCredit}
          imageMetadata={lightboxState.imageMetadata}
          instagramUrl={lightboxState.instagramUrl}
          embedCode={lightboxState.embedCode}
          onCopySuccess={(message, position) => {
            showToast(message, position || { x: window.innerWidth / 2, y: window.innerHeight / 2 });
          }}
        />
      )}

    </div>
  );
}
