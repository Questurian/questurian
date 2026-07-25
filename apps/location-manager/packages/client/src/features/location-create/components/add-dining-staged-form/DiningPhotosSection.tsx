import type { ReactNode } from "react";
import { Button } from "@client/components/ui/button";
import { PhotoImportPhase } from "../PhotoImportPhase";
import type { PhotoImportSessionState } from "../PhotoImportPhase";

interface DiningPhotosSectionProps {
  placeId: string | null;
  createButton: ReactNode;
  onSessionChange: (session: PhotoImportSessionState) => void;
  onPrevious: () => void;
}

export function DiningPhotosSection({
  placeId,
  createButton,
  onSessionChange,
  onPrevious,
}: DiningPhotosSectionProps) {
  return (
    <section className="space-y-5">
      <PhotoImportPhase
        placeId={placeId}
        category="dining"
        onSessionChange={onSessionChange}
      />
      <div className="flex justify-between border-t border-border/70 pt-4">
        <Button type="button" variant="outline" onClick={onPrevious}>
          Previous
        </Button>
        {createButton}
      </div>
    </section>
  );
}
