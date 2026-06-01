import { X } from "lucide-react";
import { Button } from "@client/components/ui";
import type { InstagramEmbed } from "@client/shared/services/api/types";
import { toImageApiPath } from "./location-media-gallery.utils";

interface InstagramEmbedsGalleryProps {
  embeds: InstagramEmbed[];
  onOpen: (embed: InstagramEmbed, index: number) => void;
  onDelete: (embedId: number) => void;
}

export function InstagramEmbedsGallery({ embeds, onOpen, onDelete }: InstagramEmbedsGalleryProps) {
  if (embeds.length === 0) return null;
  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Instagram Posts:</span>
      <ul className="flex gap-2 ml-4 flex-wrap">
        {embeds.map((embed) => (
          <li key={embed.id} className="relative group">
            <div className="shrink-0 w-[120px] h-[120px] overflow-hidden rounded bg-muted hover:ring-2 ring-primary transition-all">
              <img src={`${toImageApiPath(embed.images![0])}?v=${embed.id ?? "embed"}`} alt="Instagram" className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" loading="lazy" onClick={() => onOpen(embed, 0)} title={embed.username ? `@${embed.username}` : "Click to view"} />
            </div>
            <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onDelete(embed.id!)}>
              <X className="h-3 w-3" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
