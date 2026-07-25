import { Loader2 } from "lucide-react";
import { Button } from "@client/components/ui/button";

interface DiningCreateButtonProps {
  isPrefillReady: boolean;
  isFormValid: boolean;
  isCreating: boolean;
  photoImportEnabled: boolean;
  selectedCount: number;
  photoCount: number;
  photoReady: boolean;
  allAiUrlsVerified: boolean;
}

export function DiningCreateButton({
  isPrefillReady,
  isFormValid,
  isCreating,
  photoImportEnabled,
  selectedCount,
  photoCount,
  photoReady,
  allAiUrlsVerified,
}: DiningCreateButtonProps) {
  return (
    <Button
      type="submit"
      disabled={
        !isPrefillReady
        || !isFormValid
        || isCreating
        || (selectedCount > 0 && !photoReady)
        || !allAiUrlsVerified
      }
      className="gap-2"
      title={
        !allAiUrlsVerified
          ? "Verify each AI-suggested link before Create"
          : selectedCount > 0 && !photoReady
            ? `${photoCount} of ${selectedCount} photos cropped — finish each crop before Create`
            : undefined
      }
    >
      {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
      {isCreating
        ? "Creating..."
        : !allAiUrlsVerified
          ? "Verify AI links to enable Create"
          : !photoImportEnabled
            ? "Create"
            : selectedCount === 0
              ? "Create without photos"
              : photoReady
                ? `Create with ${photoCount} photo${photoCount === 1 ? "" : "s"}`
                : `Crop ${selectedCount - photoCount} more to enable Create`}
    </Button>
  );
}
