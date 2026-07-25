import { useState } from "react";
import type { StagedSourceSnapshot } from "@client/shared/services/api";
import { useGenerateAltText } from "@client/shared/services/api/hooks/useGenerateAltText";
import { useToast } from "@client/shared/hooks/useToast";
import { fetchSourceFile } from "./photoImportPanel.utils";

type AltReviewState = {
  isOpen: boolean;
  uploadId: number | null;
  file: File | null;
  generatedText: string;
  error: string | null;
};

const CLOSED_ALT_REVIEW_STATE: AltReviewState = {
  isOpen: false,
  uploadId: null,
  file: null,
  generatedText: "",
  error: null,
};

type UseAltTextReviewOptions = {
  /**
   * Called when the operator approves an alt text. The panel uses this to hand
   * the source and its approved alt text on to the cropper.
   */
  onApproved: (uploadId: number, file: File, altText: string) => void;
};

/**
 * The alt-text review step of the photo-import flow.
 *
 * Opening a review downloads the staged source, then generates alt text unless
 * a value is already cached for that upload (either from a previous generation
 * in this session or from the source itself). Generated text is cached per
 * uploadId so reopening a review does not re-bill the model.
 */
export function useAltTextReview({ onApproved }: UseAltTextReviewOptions) {
  const { showToast } = useToast();
  const [altReviewState, setAltReviewState] = useState<AltReviewState>(CLOSED_ALT_REVIEW_STATE);
  const [cachedAltTexts, setCachedAltTexts] = useState<Record<number, string>>({});
  const [loadingSourceId, setLoadingSourceId] = useState<number | null>(null);
  const generateAltText = useGenerateAltText();

  async function generateAltTextForReview(file: File, uploadId: number) {
    try {
      const result = await generateAltText.mutateAsync({ imageFile: file, uploadId });
      setCachedAltTexts((current) => ({ ...current, [uploadId]: result.altText }));
      setAltReviewState((state) => state.uploadId === uploadId
        ? { ...state, generatedText: result.altText, error: null }
        : state);
    } catch (error) {
      setAltReviewState((state) => state.uploadId === uploadId
        ? { ...state, error: error instanceof Error ? error.message : "Alt-text generation failed" }
        : state);
    }
  }

  async function handleOpenReview(source: StagedSourceSnapshot) {
    if (!source.sourcePath) return;
    setLoadingSourceId(source.uploadId);
    try {
      const file = await fetchSourceFile(source);
      const cachedAltText = cachedAltTexts[source.uploadId] ?? source.altText ?? "";
      setAltReviewState({
        isOpen: true,
        uploadId: source.uploadId,
        file,
        generatedText: cachedAltText,
        error: null,
      });
      if (!cachedAltText) await generateAltTextForReview(file, source.uploadId);
    } catch (err) {
      const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(err instanceof Error ? err.message : "Failed to load source", center);
    } finally {
      setLoadingSourceId((current) => (current === source.uploadId ? null : current));
    }
  }

  function closeAltReview() {
    setAltReviewState(CLOSED_ALT_REVIEW_STATE);
  }

  function confirmAltText(altText: string) {
    if (!altReviewState.uploadId || !altReviewState.file) return;
    onApproved(altReviewState.uploadId, altReviewState.file, altText);
    closeAltReview();
  }

  function regenerateAltText() {
    if (altReviewState.file && altReviewState.uploadId) {
      void generateAltTextForReview(altReviewState.file, altReviewState.uploadId);
    }
  }

  return {
    altReviewState,
    loadingSourceId,
    handleOpenReview,
    closeAltReview,
    confirmAltText,
    regenerateAltText,
    isGeneratingAltText: generateAltText.isPending,
  };
}
