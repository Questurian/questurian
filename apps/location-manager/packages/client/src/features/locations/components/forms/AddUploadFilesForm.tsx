import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormInput } from "@client/shared/components/forms";
import { Button } from "@client/components/ui/button";
import { useToast } from "@client/shared/hooks/useToast";
import { useAddUploadImageSet } from "@client/shared/services/api/hooks/useAddUploadImageSet";
import { useGenerateAltText } from "@client/shared/services/api/hooks/useGenerateAltText";
import { useLocationById } from "@client/shared/services/api/hooks/useLocationById";
import { ImagePreviewGrid } from "../ui/ImagePreviewGrid";
import { MultiVariantCropperModal } from "../modals/MultiVariantCropperModal";
import { AltTextReviewModal } from "../modals/AltTextReviewModal";
import { Upload } from "lucide-react";
import {
  addUploadFilesSchema,
  type AddUploadFilesFormData,
} from "../../validation/add-upload-files.schema";
import type { ImageVariantType } from "@questurian/lm-shared";

interface AddUploadFilesFormProps {
  locationId: number;
}

interface ProcessedImageSet {
  sourceFile: File;
  variantFiles: { type: ImageVariantType; file: File }[];
  altText?: string;
}

export function AddUploadFilesForm({ locationId }: AddUploadFilesFormProps) {
  const { showToast } = useToast();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processedImageSets, setProcessedImageSets] = useState<(ProcessedImageSet | null)[]>([]);
  const [cropModalState, setCropModalState] = useState<{
    isOpen: boolean;
    fileIndex: number | null;
  }>({ isOpen: false, fileIndex: null });
  const [altTextModalState, setAltTextModalState] = useState<{
    isOpen: boolean;
    fileIndex: number | null;
    aiGeneratedText: string;
  }>({ isOpen: false, fileIndex: null, aiGeneratedText: "" });
  const [confirmedAltTexts, setConfirmedAltTexts] = useState<(string | undefined)[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch location data to get the title for default photographer credit
  const { data: location } = useLocationById(locationId);

  const form = useForm<AddUploadFilesFormData>({
    resolver: zodResolver(addUploadFilesSchema),
    defaultValues: {
      photographerCredit: "",
    },
  });

  // Update photographer credit default when location data loads
  useEffect(() => {
    if (location?.title && !form.getValues("photographerCredit")) {
      form.setValue("photographerCredit", location.title);
    }
  }, [location?.title, form]);

  const { mutate: generateAltText, isPending: isGeneratingAltText } = useGenerateAltText({
    onSuccess: (data) => {
      if (altTextModalState.fileIndex !== null) {
        setAltTextModalState(prev => ({
          ...prev,
          aiGeneratedText: data.altText
        }));
      }
    },
    onError: (error) => {
      console.warn("Failed to generate alt text:", error);
      // Continue with empty alt text
      if (altTextModalState.fileIndex !== null) {
        setAltTextModalState(prev => ({
          ...prev,
          aiGeneratedText: ""
        }));
      }
    },
  });

  const { mutate, isPending, uploadProgress } = useAddUploadImageSet(locationId, {
    onSuccess: () => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(`Image set uploaded successfully (5 variants)`, centerPosition);
      handleReset();
    },
    onError: (error) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(error.message || "Failed to upload image set", centerPosition);
    },
  });

  function handleFileSelect(files: FileList | null) {
    if (!files) return;
    const fileArray = Array.from(files);
    const startIndex = selectedFiles.length;

    setSelectedFiles((prev) => [...prev, ...fileArray]);
    setProcessedImageSets((prev) => [...prev, ...new Array(fileArray.length).fill(null)]);
    setConfirmedAltTexts((prev) => [...prev, ...new Array(fileArray.length).fill(undefined)]);

    // Auto-open first new file for alt text generation
    setAltTextModalState({
      isOpen: true,
      fileIndex: startIndex,
      aiGeneratedText: ""
    });

    // Generate alt text for the first file
    if (fileArray.length > 0) {
      generateAltText(fileArray[0]);
    }

    // Reset the file input value so the same files can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleRemoveFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setProcessedImageSets((prev) => prev.filter((_, i) => i !== index));
    setConfirmedAltTexts((prev) => prev.filter((_, i) => i !== index));

    // If modal was open for this file, close it
    if (cropModalState.fileIndex === index) {
      setCropModalState({ isOpen: false, fileIndex: null });
    }
    if (altTextModalState.fileIndex === index) {
      setAltTextModalState({ isOpen: false, fileIndex: null, aiGeneratedText: "" });
    }
  }

  function handleReset() {
    setSelectedFiles([]);
    setProcessedImageSets([]);
    setConfirmedAltTexts([]);
    setCropModalState({ isOpen: false, fileIndex: null });
    setAltTextModalState({ isOpen: false, fileIndex: null, aiGeneratedText: "" });
    form.reset();
    // Reset photographer credit to location title after form reset
    if (location?.title) {
      form.setValue("photographerCredit", location.title);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleSubmit(data: AddUploadFilesFormData) {
    if (!areAllFilesCropped()) return;

    // Currently only supporting 1 image set per upload
    // Can be extended to support multiple in the future
    const imageSet = processedImageSets[0];
    if (!imageSet) return;

    // Get the alt text for this image set
    const altText = confirmedAltTexts[0];

    mutate({
      sourceFile: imageSet.sourceFile,
      variantFiles: imageSet.variantFiles,
      photographerCredit: data.photographerCredit || undefined,
      altText: altText,
    });
  }

  // Cropping workflow handlers
  function handleCropImage(index: number) {
    setCropModalState({ isOpen: true, fileIndex: index });
  }

  function handleCropConfirm(
    sourceFile: File,
    variantFiles: { type: ImageVariantType; file: File }[]
  ) {
    if (cropModalState.fileIndex === null) return;

    setProcessedImageSets((prev) => {
      const updated = [...prev];
      updated[cropModalState.fileIndex!] = { sourceFile, variantFiles };
      return updated;
    });

    // Auto-open next uncropped file
    const nextUncropped = findNextUncroppedIndex(cropModalState.fileIndex + 1);
    if (nextUncropped !== null) {
      setCropModalState({ isOpen: true, fileIndex: nextUncropped });
    } else {
      setCropModalState({ isOpen: false, fileIndex: null });
    }
  }

  function findNextUncroppedIndex(startIndex: number): number | null {
    for (let i = startIndex; i < selectedFiles.length; i++) {
      if (!processedImageSets[i]) return i;
    }
    return null;
  }

  // Alt text modal handlers
  function handleAltTextConfirm(altText: string) {
    if (altTextModalState.fileIndex === null) return;

    // Store the confirmed alt text
    setConfirmedAltTexts((prev) => {
      const updated = [...prev];
      updated[altTextModalState.fileIndex!] = altText;
      return updated;
    });

    // Close alt text modal and open crop modal
    setAltTextModalState({ isOpen: false, fileIndex: null, aiGeneratedText: "" });
    setCropModalState({ isOpen: true, fileIndex: altTextModalState.fileIndex });
  }

  function handleAltTextCancel() {
    // Remove the file and reset
    if (altTextModalState.fileIndex !== null) {
      handleRemoveFile(altTextModalState.fileIndex);
    }
    setAltTextModalState({ isOpen: false, fileIndex: null, aiGeneratedText: "" });
  }

  function areAllFilesCropped(): boolean {
    return (
      selectedFiles.length > 0 &&
      selectedFiles.every((_, i) => processedImageSets[i] !== null)
    );
  }

  function hasCroppedImages(): boolean {
    return processedImageSets.some((set) => set !== null);
  }

  // Drag and drop handlers
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    handleFileSelect(files);
  }

  return (
    <div className="border rounded-lg p-4 bg-muted/50 space-y-3 min-h-[368px]">
      <h4 className="text-sm font-semibold text-foreground">Add Images</h4>

      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
        {/* Drag and drop zone - only show when no cropped images exist */}
        {!hasCroppedImages() && (
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
            <p className="text-sm text-gray-600 mb-2">
              Drag and drop images here, or click to select
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPending}
            >
              Choose Files
            </Button>
            <p className="text-xs text-gray-500 mt-2">
              {selectedFiles.length} file(s) selected
            </p>
          </div>
        )}

        {/* Image preview grid */}
        {selectedFiles.length > 0 && (
          <ImagePreviewGrid
            files={selectedFiles}
            onRemove={handleRemoveFile}
            onCrop={handleCropImage}
            croppedIndicators={processedImageSets.map((set) => set !== null)}
          />
        )}

        {/* Photographer credit */}
        <FormInput
          control={form.control}
          name="photographerCredit"
          label="Photographer Credit *"
          placeholder="Name, studio, or publication"
        />

        {/* Progress bar */}
        {isPending && uploadProgress > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-600">
              <span>Uploading...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={isPending || !areAllFilesCropped()}
            size="sm"
          >
            {isPending
              ? `Uploading... ${uploadProgress}%`
              : areAllFilesCropped()
                ? "Upload Image Set (5 variants)"
                : `Crop ${selectedFiles.length - processedImageSets.filter(Boolean).length} more image(s)`}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={isPending}
            size="sm"
          >
            Clear
          </Button>
        </div>
      </form>

      {/* Alt text review modal */}
      {altTextModalState.isOpen && altTextModalState.fileIndex !== null && (
        <AltTextReviewModal
          isOpen={altTextModalState.isOpen}
          onClose={handleAltTextCancel}
          onConfirm={handleAltTextConfirm}
          imageFile={selectedFiles[altTextModalState.fileIndex]}
          aiGeneratedAltText={altTextModalState.aiGeneratedText}
          isLoading={isGeneratingAltText}
        />
      )}

      {/* Multi-variant crop modal */}
      {cropModalState.isOpen && cropModalState.fileIndex !== null && (
        <MultiVariantCropperModal
          file={selectedFiles[cropModalState.fileIndex]}
          isOpen={cropModalState.isOpen}
          onClose={() => setCropModalState({ isOpen: false, fileIndex: null })}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  );
}
