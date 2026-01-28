import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@client/components/ui/dialog";
import { Button } from "@client/components/ui/button";
import { Textarea } from "@client/components/ui/textarea";
import { Label } from "@client/components/ui/label";
import { Sparkles, Check, Edit, Loader } from "lucide-react";

interface AltTextReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (altText: string) => void;
  imageFile: File;
  aiGeneratedAltText?: string;
  isLoading?: boolean;
}

export function AltTextReviewModal({
  isOpen,
  onClose,
  onConfirm,
  imageFile,
  aiGeneratedAltText = "",
  isLoading = false,
}: AltTextReviewModalProps) {
  const [altText, setAltText] = useState(aiGeneratedAltText);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>("");

  // Update alt text when AI generates new text
  useEffect(() => {
    setAltText(aiGeneratedAltText);
  }, [aiGeneratedAltText]);

  // Create image preview
  useEffect(() => {
    if (imageFile) {
      const url = URL.createObjectURL(imageFile);
      setImagePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [imageFile]);

  const handleConfirm = () => {
    onConfirm(altText.trim());
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500" />
            Review AI-Generated Alt Text
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Image Preview */}
          <div className="flex justify-center">
            <div className="relative">
              <img
                src={imagePreviewUrl}
                alt="Preview"
                className="max-w-full max-h-64 rounded-lg object-contain border"
              />
              {isLoading && (
                <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                  <div className="text-white text-sm">Generating alt text...</div>
                </div>
              )}
            </div>
          </div>

          {/* Alt Text Input */}
          <div className="space-y-2">
            <Label htmlFor="alt-text" className="flex items-center gap-2">
              <Edit className="w-4 h-4" />
              Alt Text (for accessibility and SEO)
            </Label>
            <div className="relative">
              <Textarea
                id="alt-text"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder="Describe what you see in this image..."
                className="min-h-20 resize-none"
                disabled={isLoading}
              />
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded-md">
                  <Loader className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="flex justify-between items-center text-sm text-muted-foreground">
              <span>
                {aiGeneratedAltText && (
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-blue-500" />
                    AI-generated
                  </span>
                )}
              </span>
              <span>{altText.length} characters</span>
            </div>
          </div>

          {/* Tips */}
          <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg">
            <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
              💡 Alt Text Best Practices
            </h4>
            <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
              <li>• Be descriptive and specific about what's in the image</li>
              <li>• Keep it concise (under 125 characters recommended)</li>
              <li>• Focus on key visual elements and context</li>
              <li>• Include important text visible in the image</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
          >
            Cancel Upload
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading || !altText.trim()}
            className="flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            {altText === aiGeneratedAltText && aiGeneratedAltText
              ? "Use AI Text"
              : "Confirm Alt Text"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
