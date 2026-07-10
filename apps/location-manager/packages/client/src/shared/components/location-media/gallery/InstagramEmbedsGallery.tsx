import { ImageOff, Loader2, RotateCw, X } from "lucide-react";
import { Button } from "@client/components/ui";
import type { InstagramEmbed } from "@client/shared/services/api/types";
import { toImageApiPath } from "./location-media-gallery.utils";

interface InstagramEmbedsGalleryProps {
  embeds: InstagramEmbed[];
  onOpen: (embed: InstagramEmbed, index: number) => void;
  onDelete: (embedId: number) => void;
  onRetry: (embedId: number) => void;
  retrying: boolean;
}

export function InstagramEmbedsGallery({ embeds, onOpen, onDelete, onRetry, retrying }: InstagramEmbedsGalleryProps) {
  if (embeds.length === 0) return null;
  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Instagram Posts:</span>
      <ul className="flex gap-2 ml-4 flex-wrap">
        {embeds.map((embed) => (
          <li key={embed.id} className="relative group">
            <div className="flex shrink-0 w-[120px] h-[120px] items-center justify-center overflow-hidden rounded bg-muted hover:ring-2 ring-primary transition-all">
              {embed.images?.[0] ? (
                <img src={`${toImageApiPath(embed.images[0])}?v=${embed.id ?? "embed"}`} alt="Instagram" className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" loading="lazy" onClick={() => onOpen(embed, 0)} title={embed.username || "Click to view"} />
              ) : embed.media_staging_status === "processing" || embed.media_staging_status === "pending" ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <ImageOff className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            {embed.media_staging_status && (
              <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                {embed.media_staging_status}{embed.media_item_count ? ` ${embed.staged_item_count ?? 0}/${embed.media_item_count}` : ""}
              </span>
            )}
            {(embed.media_staging_status === "failed" || embed.media_staging_status === "partial") && (
              <Button variant="secondary" size="icon" title={embed.media_staging_error || "Retry image staging"} className="absolute bottom-1 right-1 h-6 w-6" disabled={retrying} onClick={() => onRetry(embed.id!)}>
                <RotateCw className="h-3 w-3" />
              </Button>
            )}
            <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onDelete(embed.id!)}>
              <X className="h-3 w-3" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
