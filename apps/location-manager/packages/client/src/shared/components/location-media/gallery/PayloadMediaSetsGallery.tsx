import { X } from "lucide-react";
import { Button } from "@client/components/ui";
import type { PayloadMediaSetItem } from "@client/shared/services/api/types";

interface PayloadMediaSetsGalleryProps {
  items: PayloadMediaSetItem[];
  uploadCount: number;
  isPending: boolean;
  onRemove: (item: PayloadMediaSetItem) => void;
}

export function PayloadMediaSetsGallery({ items, uploadCount, isPending, onRemove }: PayloadMediaSetsGalleryProps) {
  return (
    <>
      {items.map((item, index) => (
        <li key={`payload-${item.id}`} className="relative group">
          <div className="shrink-0 w-[120px] h-[120px] overflow-hidden rounded bg-muted hover:ring-2 ring-primary transition-all">
            {item.previewUrl ? (
              <img src={item.previewUrl} alt={item.altText || item.title || "Payload CMS photo"} className="w-full h-full object-cover hover:opacity-80 transition-opacity" loading="lazy" title={item.title || "Payload CMS photo"} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">No preview</div>
            )}
          </div>
          <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none">CMS</div>
          <div className="absolute top-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none">#{uploadCount + index + 1}</div>
          <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onRemove(item)} disabled={isPending} title="Remove from Payload selection">
            <X className="h-3 w-3" />
          </Button>
        </li>
      ))}
    </>
  );
}
