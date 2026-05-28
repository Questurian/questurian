import { useEffect, useDeferredValue, useRef, useState } from "react";
import { Button, Input, Label } from "@client/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@client/components/ui/dialog";
import { ErrorBoundary } from "@client/shared/components/ErrorBoundary";
import {
  useCreateTour,
  useDownloadTourSourceImage,
  useGenerateAltText,
  usePayloadMediaSets,
  useSuggestTourTitle,
  useUpdateTour,
  useUploadTourMediaSet,
} from "@client/shared/services/api/hooks";
import type { PayloadMediaSetItem, Tour, TourDraftPreview } from "@client/shared/services/api/types";
import { AltTextReviewModal } from "@client/shared/components/location-media/modals/AltTextReviewModal";
import { MultiVariantCropperModal } from "@client/shared/components/location-media/modals/MultiVariantCropperModal";
import type { ImageVariantUploadFile } from "@client/shared/types/location-media.types";
import { useCountries } from "@client/shared/hooks/useCountries";
import {
  buildLocationKey,
  extractCitiesForCountry,
  extractNeighborhoodsForCity,
} from "@client/shared/lib/filter-utils";
import { Check, ChevronLeft, ChevronRight, Image, Loader2, Search, Upload, X } from "lucide-react";

interface TourDraft {
  title: string;
  imgPayloadMediaSetId: string;
  bookingLink: string;
  price: string;
  locationKey: string;
  sourceProvider: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceImageUrl: string;
  sourceProductCode: string;
}

interface TourFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tour?: Tour | null;
  importDraft?: TourDraftPreview | null;
  /** When creating, prefill the locationKey selects (operator can still edit). */
  prefilledLocationKey?: string | null;
  /** Fires after a new Tour is created. Receives the saved Tour. */
  onCreated?: (tour: Tour) => void;
}

interface ProcessedTourImageSet {
  sourceFile: File;
  variantFiles: ImageVariantUploadFile[];
  altText?: string;
}

const EMPTY_TOUR_DRAFT: TourDraft = {
  title: "",
  imgPayloadMediaSetId: "",
  bookingLink: "",
  price: "",
  locationKey: "",
  sourceProvider: "",
  sourceUrl: "",
  sourceTitle: "",
  sourceImageUrl: "",
  sourceProductCode: "",
};

function tourToDraft(tour: Tour): TourDraft {
  return {
    title: tour.title,
    imgPayloadMediaSetId: tour.imgPayloadMediaSetId,
    bookingLink: tour.bookingLink,
    price: tour.price,
    locationKey: tour.locationKey?.trim() ?? "",
    sourceProvider: tour.sourceProvider ?? "",
    sourceUrl: tour.sourceUrl ?? "",
    sourceTitle: tour.sourceTitle ?? "",
    sourceImageUrl: tour.sourceImageUrl ?? "",
    sourceProductCode: tour.sourceProductCode ?? "",
  };
}

function importDraftToDraft(importDraft: TourDraftPreview): TourDraft {
  return {
    title: importDraft.displayTitle,
    imgPayloadMediaSetId: "",
    bookingLink: importDraft.bookingLink,
    price: importDraft.price,
    locationKey: "",
    sourceProvider: importDraft.provider,
    sourceUrl: importDraft.sourceUrl,
    sourceTitle: importDraft.sourceTitle,
    sourceImageUrl: importDraft.sourceImageUrl ?? "",
    sourceProductCode: importDraft.sourceProductCode ?? "",
  };
}

function isAbsoluteUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function formatMissingFields(fields: string[]) {
  if (fields.length === 1) return fields[0];
  if (fields.length === 2) return fields.join(" and ");
  return `${fields.slice(0, -1).join(", ")}, and ${fields[fields.length - 1]}`;
}

function MediaSetPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search.trim());
  const selectedQuery = usePayloadMediaSets({
    ids: value ? [value] : undefined,
    limit: 1,
    enabled: Boolean(value),
  });
  const mediaSetsQuery = usePayloadMediaSets({
    query: deferredSearch || undefined,
    page,
    limit: 50,
    enabled: isOpen,
    keepPreviousData: true,
  });
  const selected = selectedQuery.data?.mediaSets?.[0] ?? null;
  const mediaSets = mediaSetsQuery.data?.mediaSets ?? [];
  const hasSelectedValue = value.trim().length > 0;

  function handlePick(item: PayloadMediaSetItem) {
    onChange(item.id);
    setIsOpen(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label>Img</Label>
        {selected && (
          <span className="truncate text-xs text-muted-foreground">
            {selected.title}
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-muted/10 p-3">
        {selected ? (
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
              {selected.previewUrl ? (
                <img
                  src={selected.previewUrl}
                  alt={selected.altText || selected.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Image className="h-5 w-5" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{selected.title}</p>
              <p className="truncate text-xs text-muted-foreground">Media set ID: {selected.id}</p>
            </div>
            <Button type="button" variant="outline" onClick={() => setIsOpen(true)}>
              Change
            </Button>
          </div>
        ) : hasSelectedValue ? (
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-muted">
              {selectedQuery.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <Check className="h-5 w-5 text-primary" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {selectedQuery.isLoading ? "Loading selected media set" : "Media set selected"}
              </p>
              <p className="truncate text-xs text-muted-foreground">Media set ID: {value}</p>
            </div>
            <Button type="button" variant="outline" onClick={() => setIsOpen(true)}>
              Change
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" className="w-full" onClick={() => setIsOpen(true)}>
            <Image className="h-4 w-4" />
            Choose media set
          </Button>
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Select Tour Image</DialogTitle>
            <DialogDescription>
              Choose one Payload media set for this tour image.
            </DialogDescription>
          </DialogHeader>

          <div className="border-b px-6 py-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search by title, alt text, photographer, or external ref"
                className="h-11 pl-10"
                autoFocus
              />
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto p-6">
            {mediaSetsQuery.isLoading ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading media sets
              </div>
            ) : mediaSetsQuery.error ? (
              <div className="py-16 text-center text-sm text-destructive">
                {mediaSetsQuery.error.message}
              </div>
            ) : mediaSets.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                No media sets found.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {mediaSets.map((item) => {
                  const isSelected = item.id === value;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handlePick(item)}
                      className={`group overflow-hidden rounded-md border bg-background text-left transition-colors ${
                        isSelected
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-border hover:border-primary/70"
                      }`}
                    >
                      <div className="aspect-[4/3] overflow-hidden bg-muted">
                        {item.previewUrl ? (
                          <img
                            src={item.previewUrl}
                            alt={item.altText || item.title}
                            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <Image className="h-8 w-8" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-1 p-3">
                        <div className="flex items-start gap-2">
                          <p className="line-clamp-2 min-h-10 flex-1 text-sm font-medium text-foreground">
                            {item.title}
                          </p>
                          {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.location || item.photographerCredit || item.status || item.id}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {mediaSetsQuery.data
                ? `Page ${mediaSetsQuery.data.page} of ${mediaSetsQuery.data.totalPages} · ${mediaSetsQuery.data.totalDocs} media sets`
                : "Media sets"}
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={!mediaSetsQuery.data?.hasPrevPage || mediaSetsQuery.isFetching}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => current + 1)}
                disabled={!mediaSetsQuery.data?.hasNextPage || mediaSetsQuery.isFetching}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TourImageUploadPanel({
  title,
  sourceImageUrl,
  sourceProvider,
  onUploaded,
  onLocalImageStateChange,
  onUploadPendingChange,
}: {
  title: string;
  sourceImageUrl?: string | null;
  sourceProvider?: string | null;
  onUploaded: (mediaSetId: string) => void;
  onLocalImageStateChange?: (hasLocalImage: boolean) => void;
  onUploadPendingChange?: (isPending: boolean) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [processedImageSet, setProcessedImageSet] = useState<ProcessedTourImageSet | null>(null);
  const [photographerCredit, setPhotographerCredit] = useState("");
  const [altTextModalOpen, setAltTextModalOpen] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [aiGeneratedAltText, setAiGeneratedAltText] = useState("");
  const [altTextGenerationError, setAltTextGenerationError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const uploadTourMediaSet = useUploadTourMediaSet();
  const downloadSourceImage = useDownloadTourSourceImage();
  const { mutate: generateAltText, isPending: isGeneratingAltText } = useGenerateAltText({
    onSuccess: (data) => {
      setAiGeneratedAltText(data.altText);
      setAltTextGenerationError(null);
    },
    onError: () => {
      setAiGeneratedAltText("");
      setAltTextGenerationError("AI alt text unavailable. Enter alt text manually.");
    },
  });

  useEffect(() => {
    if (!sourceProvider || photographerCredit.trim()) return;
    setPhotographerCredit(sourceProvider === "viator" ? "Viator" : sourceProvider);
  }, [sourceProvider, photographerCredit]);

  function resetUploadState() {
    setSourceFile(null);
    setProcessedImageSet(null);
    setAltTextModalOpen(false);
    setCropModalOpen(false);
    setAiGeneratedAltText("");
    setAltTextGenerationError(null);
    setFileError(null);
    setIsDragging(false);
    onLocalImageStateChange?.(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleFileSelect(fileList: FileList | null) {
    const file = fileList?.[0] ?? null;
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setFileError("Drop or choose an image file.");
      return;
    }

    setSourceFile(file);
    setProcessedImageSet(null);
    setAiGeneratedAltText("");
    setAltTextGenerationError(null);
    setFileError(null);
    setIsDragging(false);
    onLocalImageStateChange?.(true);
    setAltTextModalOpen(true);
    generateAltText(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  useEffect(() => {
    if (!sourceImageUrl || sourceFile || downloadSourceImage.isPending) return;
    downloadSourceImage.mutate(sourceImageUrl, {
      onSuccess: (file) => {
        handleFileSelect({
          0: file,
          length: 1,
          item: (index: number) => (index === 0 ? file : null),
        } as unknown as FileList);
      },
      onError: (error) => {
        setFileError(error instanceof Error ? error.message : "Could not download source image.");
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceImageUrl]);

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    handleFileSelect(event.dataTransfer.files);
  }

  function handleAltTextConfirm(altText: string) {
    if (!sourceFile) return;
    setProcessedImageSet({
      sourceFile,
      variantFiles: [],
      altText,
    });
    setAltTextModalOpen(false);
    setCropModalOpen(true);
  }

  function handleCropConfirm(
    croppedSourceFile: File,
    variantFiles: ImageVariantUploadFile[]
  ) {
    setProcessedImageSet((current) => ({
      sourceFile: croppedSourceFile,
      variantFiles,
      altText: current?.altText,
    }));
    setCropModalOpen(false);
  }

  function handleUpload() {
    if (!processedImageSet || processedImageSet.variantFiles.length === 0) return;
    const normalizedTitle = title.trim();
    const normalizedCredit = photographerCredit.trim();
    if (!normalizedTitle || !normalizedCredit) return;

    onUploadPendingChange?.(true);
    uploadTourMediaSet.mutate(
      {
        title: normalizedTitle,
        sourceFile: processedImageSet.sourceFile,
        variantFiles: processedImageSet.variantFiles,
        photographerCredit: normalizedCredit,
        altText: processedImageSet.altText,
      },
      {
        onSuccess: ({ mediaSetId }) => {
          onUploaded(mediaSetId);
          onLocalImageStateChange?.(false);
          resetUploadState();
        },
        onError: () => onUploadPendingChange?.(false),
        onSettled: () => onUploadPendingChange?.(false),
      }
    );
  }

  const hasCrops = Boolean(processedImageSet && processedImageSet.variantFiles.length > 0);
  const canUpload = hasCrops && title.trim().length > 0 && photographerCredit.trim().length > 0;

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Upload new photo</p>
          <p className="text-xs text-muted-foreground">
            Crop the same seven variants used by Location Manager image uploads.
          </p>
        </div>
        {sourceFile && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetUploadState}
            disabled={uploadTourMediaSet.isPending}
          >
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {!sourceFile ? (
        <div
          className={`rounded-md border border-dashed bg-background p-5 text-center transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-border"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {downloadSourceImage.isPending
              ? "Downloading source image..."
              : "Drag and drop one source photo here, or click to choose."}
          </p>
          {fileError && <p className="mt-2 text-xs text-destructive">{fileError}</p>}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => handleFileSelect(event.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose photo
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto]">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted">
              <Image className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="line-clamp-2 break-all text-sm font-medium leading-5 text-foreground"
                title={sourceFile.name}
              >
                {sourceFile.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {hasCrops ? "All variants cropped" : "Needs crop review"}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCropModalOpen(true)}
              disabled={!sourceFile || uploadTourMediaSet.isPending}
              className="col-span-2 w-full sm:col-span-1 sm:w-auto"
            >
              {hasCrops ? "Adjust crops" : "Crop"}
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Photographer credit</Label>
            <Input
              value={photographerCredit}
              onChange={(event) => setPhotographerCredit(event.target.value)}
              placeholder="Name, studio, or publication"
              disabled={uploadTourMediaSet.isPending}
            />
          </div>

          {uploadTourMediaSet.isPending && uploadTourMediaSet.uploadProgress > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Uploading media set...</span>
                <span>{uploadTourMediaSet.uploadProgress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${uploadTourMediaSet.uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {uploadTourMediaSet.error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
              <p className="text-sm font-medium text-destructive">{uploadTourMediaSet.error.message}</p>
            </div>
          )}

          <Button
            type="button"
            onClick={handleUpload}
            disabled={!canUpload || uploadTourMediaSet.isPending}
            size="sm"
          >
            {uploadTourMediaSet.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Upload and use photo
          </Button>
        </div>
      )}

      {sourceFile && altTextModalOpen && (
        <AltTextReviewModal
          isOpen={altTextModalOpen}
          onClose={resetUploadState}
          onConfirm={handleAltTextConfirm}
          imageFile={sourceFile}
          aiGeneratedAltText={aiGeneratedAltText}
          generationError={altTextGenerationError || undefined}
          isLoading={isGeneratingAltText}
        />
      )}

      {sourceFile && cropModalOpen && (
        <MultiVariantCropperModal
          file={sourceFile}
          isOpen={cropModalOpen}
          onClose={() => setCropModalOpen(false)}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  );
}

function TourFormDialogContent({
  onOpenChange,
  tour = null,
  initialMediaSetId = "",
  onMediaSetIdPersist,
  importDraft = null,
  prefilledLocationKey = null,
  onCreated,
}: Pick<TourFormDialogProps, "onOpenChange" | "tour"> & {
  initialMediaSetId?: string;
  onMediaSetIdPersist?: (id: string) => void;
  importDraft?: TourDraftPreview | null;
  prefilledLocationKey?: string | null;
  onCreated?: (tour: Tour) => void;
}) {
  const initialLocationKey = prefilledLocationKey?.trim() ?? "";
  const [draft, setDraft] = useState<TourDraft>(() => {
    if (tour) return tourToDraft(tour);
    const base = importDraft ? importDraftToDraft(importDraft) : { ...EMPTY_TOUR_DRAFT };
    return {
      ...base,
      imgPayloadMediaSetId: initialMediaSetId,
      locationKey: base.locationKey || initialLocationKey,
    };
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [hasPendingLocalImage, setHasPendingLocalImage] = useState(false);
  const [isImageUploadPending, setIsImageUploadPending] = useState(false);
  const createTourMutation = useCreateTour();
  const updateTourMutation = useUpdateTour();
  const suggestTitleMutation = useSuggestTourTitle();
  const isEditing = Boolean(tour);
  const { data: countries = [], isLoading: isLoadingCountries } = useCountries();

  function parseLocationKey(key: string, countriesList: typeof countries) {
    if (!key || !countriesList.length) return { countryCode: "", cityValue: "", neighborhoodValue: "" };
    const [countryLabel, cityValue = "", neighborhoodValue = ""] = key.split("|");
    const country = countriesList.find((c) => c.label.toLowerCase() === countryLabel);
    return { countryCode: country?.code ?? "", cityValue, neighborhoodValue };
  }

  const [selectedCountry, setSelectedCountry] = useState(() => parseLocationKey(draft.locationKey, countries).countryCode);
  const [selectedCity, setSelectedCity] = useState(() => parseLocationKey(draft.locationKey, countries).cityValue);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState(() => parseLocationKey(draft.locationKey, countries).neighborhoodValue);
  const locationInitialized = useRef(selectedCountry !== "");

  useEffect(() => {
    if (locationInitialized.current || !countries.length || !draft.locationKey) return;
    locationInitialized.current = true;
    const { countryCode, cityValue, neighborhoodValue } = parseLocationKey(draft.locationKey, countries);
    if (!countryCode) return;
    setSelectedCountry(countryCode);
    if (cityValue) setSelectedCity(cityValue);
    if (neighborhoodValue) setSelectedNeighborhood(neighborhoodValue);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries]);

  const cities = selectedCountry ? extractCitiesForCountry(countries, selectedCountry) : [];
  const neighborhoods =
    selectedCity ? extractNeighborhoodsForCity(countries, selectedCountry, selectedCity) : [];

  function handleCountryChange(countryCode: string) {
    setSelectedCountry(countryCode);
    setSelectedCity("");
    setSelectedNeighborhood("");
    updateDraft({ locationKey: buildLocationKey(countries, countryCode || null, null, null) ?? "" });
  }

  function handleCityChange(cityValue: string) {
    setSelectedCity(cityValue);
    setSelectedNeighborhood("");
    updateDraft({ locationKey: buildLocationKey(countries, selectedCountry || null, cityValue || null, null) ?? "" });
  }

  function handleNeighborhoodChange(neighborhoodValue: string) {
    setSelectedNeighborhood(neighborhoodValue);
    updateDraft({
      locationKey:
        buildLocationKey(countries, selectedCountry || null, selectedCity || null, neighborhoodValue || null) ?? "",
    });
  }
  const isSaving =
    createTourMutation.isPending || updateTourMutation.isPending || isImageUploadPending;

  function updateDraft(nextDraft: Partial<TourDraft>) {
    setDraft((current) => ({
      ...current,
      ...nextDraft,
    }));
    setFormError(null);

    if (nextDraft.imgPayloadMediaSetId) {
      setHasPendingLocalImage(false);
      onMediaSetIdPersist?.(nextDraft.imgPayloadMediaSetId);
    }
  }

  function saveDraft() {
    const title = draft.title.trim();
    const imgPayloadMediaSetId = draft.imgPayloadMediaSetId.trim();
    const bookingLink = draft.bookingLink.trim();
    const price = draft.price.trim();
    const missingTextFields = [
      !title ? "title" : null,
      !bookingLink ? "booking link" : null,
      !price ? "price" : null,
    ].filter((field): field is string => Boolean(field));

    if (missingTextFields.length > 0) {
      setFormError(`Missing ${formatMissingFields(missingTextFields)}.`);
      return;
    }

    if (!imgPayloadMediaSetId) {
      setFormError(
        hasPendingLocalImage
          ? "The photo is staged locally but is not uploaded yet. Finish crop review, then click Upload and use photo before saving."
          : "Choose an existing media set or upload a new photo before saving."
      );
      return;
    }

    if (!isAbsoluteUrl(bookingLink)) {
      setFormError("Booking link must be a valid absolute URL.");
      return;
    }

    const locationKeyTrimmed = draft.locationKey.trim();

    const payload = {
      title,
      imgPayloadMediaSetId,
      bookingLink,
      price,
      ...(locationKeyTrimmed ? { locationKey: locationKeyTrimmed } : {}),
      ...(draft.sourceProvider.trim() ? { sourceProvider: draft.sourceProvider.trim() } : {}),
      ...(draft.sourceUrl.trim() ? { sourceUrl: draft.sourceUrl.trim() } : {}),
      ...(draft.sourceTitle.trim() ? { sourceTitle: draft.sourceTitle.trim() } : {}),
      ...(draft.sourceImageUrl.trim() ? { sourceImageUrl: draft.sourceImageUrl.trim() } : {}),
      ...(draft.sourceProductCode.trim() ? { sourceProductCode: draft.sourceProductCode.trim() } : {}),
    };
    if (tour) {
      updateTourMutation.mutate(
        {
          id: tour.id,
          data: {
            title,
            imgPayloadMediaSetId,
            bookingLink,
            price,
            locationKey: locationKeyTrimmed || null,
            sourceProvider: draft.sourceProvider.trim() || null,
            sourceUrl: draft.sourceUrl.trim() || null,
            sourceTitle: draft.sourceTitle.trim() || null,
            sourceImageUrl: draft.sourceImageUrl.trim() || null,
            sourceProductCode: draft.sourceProductCode.trim() || null,
          },
        },
        { onSuccess: () => onOpenChange(false) }
      );
      return;
    }

    createTourMutation.mutate(payload, {
      onSuccess: (createdTour) => {
        onCreated?.(createdTour);
        onOpenChange(false);
      },
    });
  }

  return (
    <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-x-hidden overflow-y-auto p-4 sm:p-6">
      <DialogHeader>
        <DialogTitle>{isEditing ? "Edit Tour" : "New Tour"}</DialogTitle>
        <DialogDescription>
          Optional <span className="font-medium text-foreground">Place / geography</span> sets the Payload{" "}
          <code className="text-foreground/90">locations</code> relationship for site organization (same pipe
          key as venues). Tours still attach to attractions separately. Use{" "}
          <span className="font-medium text-foreground">Sync to Payload</span> on the Tours list to push
          updates to Questura.
        </DialogDescription>
      </DialogHeader>

      <div className="min-w-0 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label>Display title</Label>
            {draft.sourceTitle && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={suggestTitleMutation.isPending}
                onClick={() => {
                  suggestTitleMutation.mutate(
                    {
                      sourceTitle: draft.sourceTitle,
                      description: importDraft?.description ?? null,
                      provider: draft.sourceProvider || null,
                      duration: importDraft?.duration ?? null,
                      price: draft.price || null,
                      locationKey: draft.locationKey || null,
                    },
                    {
                      onSuccess: (result) => updateDraft({ title: result.displayTitle }),
                    }
                  );
                }}
              >
                {suggestTitleMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                AI title
              </Button>
            )}
          </div>
          <Input
            value={draft.title}
            onChange={(event) => updateDraft({ title: event.target.value })}
            placeholder="Sacred Valley Day Tour"
          />
          {draft.sourceTitle && (
            <p className="text-xs text-muted-foreground">
              Source title: <span className="font-medium text-foreground">{draft.sourceTitle}</span>
            </p>
          )}
        </div>
        <MediaSetPicker
          value={draft.imgPayloadMediaSetId}
          onChange={(value) => updateDraft({ imgPayloadMediaSetId: value })}
        />
        <TourImageUploadPanel
          title={draft.title}
          sourceImageUrl={draft.sourceImageUrl || null}
          sourceProvider={draft.sourceProvider || null}
          onUploaded={(mediaSetId) => updateDraft({ imgPayloadMediaSetId: mediaSetId })}
          onLocalImageStateChange={setHasPendingLocalImage}
          onUploadPendingChange={setIsImageUploadPending}
        />
        <div className="space-y-2">
          <Label>Booking link</Label>
          <Input
            value={draft.bookingLink}
            onChange={(event) => updateDraft({ bookingLink: event.target.value })}
            placeholder="https://example.com/book"
          />
        </div>
        <div className="space-y-2">
          <Label>Price</Label>
          <Input
            value={draft.price}
            onChange={(event) => updateDraft({ price: event.target.value })}
            placeholder="From $45"
          />
        </div>
        <div className="space-y-2">
          <Label>Place / geography (optional)</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select
              value={selectedCountry}
              onChange={(e) => handleCountryChange(e.target.value)}
              disabled={isLoadingCountries}
              className="h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground"
            >
              <option value="">{isLoadingCountries ? "Loading…" : "Country"}</option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={selectedCity}
              onChange={(e) => handleCityChange(e.target.value)}
              disabled={!selectedCountry || cities.length === 0}
              className="h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground disabled:opacity-50"
            >
              <option value="">City</option>
              {cities.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={selectedNeighborhood}
              onChange={(e) => handleNeighborhoodChange(e.target.value)}
              disabled={!selectedCity || neighborhoods.length === 0}
              className="h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground disabled:opacity-50"
            >
              <option value="">Neighborhood</option>
              {neighborhoods.map((n) => (
                <option key={n.value} value={n.value}>
                  {n.label}
                </option>
              ))}
            </select>
          </div>
          {draft.locationKey ? (
            <p className="text-xs text-muted-foreground font-mono">{draft.locationKey}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Maps to Questura <code className="text-foreground/90">tours.locationRef</code> after sync.
            </p>
          )}
        </div>
        {(formError || createTourMutation.error || updateTourMutation.error) && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
            <p className="text-sm font-medium text-destructive">
              {formError ||
                createTourMutation.error?.message ||
                updateTourMutation.error?.message}
            </p>
          </div>
        )}
        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={saveDraft} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isImageUploadPending ? "Uploading image..." : "Save tour"}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

export function TourFormDialog({
  open,
  onOpenChange,
  tour = null,
  importDraft = null,
  prefilledLocationKey = null,
  onCreated,
}: TourFormDialogProps) {
  const baseKey = tour ? `tour-${tour.id}` : importDraft ? `import-${importDraft.sourceUrl}` : "new-tour";
  // Persisted outside ErrorBoundary so it survives crash+reset.
  const [persistedMediaSetId, setPersistedMediaSetId] = useState("");
  const [resetCount, setResetCount] = useState(0);
  const contentKey = `${baseKey}-${resetCount}`;

  useEffect(() => {
    if (!open) {
      setPersistedMediaSetId("");
      setResetCount(0);
    }
  }, [open]);

  function handleTryAgain() {
    // Incrementing resetCount remounts both ErrorBoundary and TourFormDialogContent
    // with a fresh key, bypassing the need to call reset() on the old boundary.
    setResetCount((c) => c + 1);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <ErrorBoundary
          key={contentKey}
          fallback={() => (
            <DialogContent className="max-w-md p-6">
              <DialogHeader>
                <DialogTitle>Something went wrong</DialogTitle>
                <DialogDescription>
                  {persistedMediaSetId
                    ? "Your image was uploaded. Click \"Try again\" — the form will reopen with the image already selected."
                    : "An error occurred inside this dialog. Your upload may have completed — check the media set list before retrying."}
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                <Button type="button" onClick={handleTryAgain}>
                  Try again
                </Button>
              </div>
            </DialogContent>
          )}
        >
          <TourFormDialogContent
            key={contentKey}
            onOpenChange={onOpenChange}
            tour={tour}
            importDraft={importDraft}
            initialMediaSetId={persistedMediaSetId}
            onMediaSetIdPersist={setPersistedMediaSetId}
            prefilledLocationKey={prefilledLocationKey}
            onCreated={onCreated}
          />
        </ErrorBoundary>
      )}
    </Dialog>
  );
}
