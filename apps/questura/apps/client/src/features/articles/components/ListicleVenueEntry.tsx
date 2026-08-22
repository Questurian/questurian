import { useCallback, type JSX } from "react";
import { InstagramEmbedBlock } from "@/features/articles/components/InstagramEmbedBlock";
import { useListicleMapSync } from "@/features/articles/components/ListicleMapSync";
import { ListiclePhotoCarousel } from "@/features/articles/components/ListiclePhotoCarousel";
import { ListicleTourPicks } from "@/features/articles/components/ListicleTourPicks";
import { ListicleVenueInfoGrid } from "@/features/articles/components/ListicleVenueInfoGrid";
import { ListicleVenueTitleRow } from "@/features/articles/components/ListicleVenueTitleRow";
import {
  listicleItemImagesFromRow,
  priceLevelLabel,
  priceTierDescriptor,
} from "@/features/articles/lib/listicleItemHelpers";
import { listicleInstagramEmbedCode } from "@/features/articles/lib/listicleInstagram";
import type { ListicleItemRow } from "@/features/articles/types/mapsListicle";
import { ItineraryMomentBadge } from "@/features/articles/components/ItineraryMomentBadge";
import { buildNightlifeDetailsCell } from "@/features/articles/components/ItineraryNightlifeDetails";

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      )
    : [];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function ListicleVenueEntry({
  row,
  index,
  moment,
  momentLabel,
}: {
  row: ListicleItemRow;
  index: number;
  moment?: string | null;
  momentLabel?: string | null;
}): JSX.Element {
  const { registerEntry } = useListicleMapSync();
  const images = listicleItemImagesFromRow(row);
  const price = priceLevelLabel(row.item.priceLevel);
  const idealFor = stringArray(row.item.idealFor);
  const blurb = row.blurb;
  const instagramCode = listicleInstagramEmbedCode(row);
  const nightlifeDetailsCell =
    row.blockType === "itinerary-nightlife" || row.blockType === "data-nightlife"
      ? buildNightlifeDetailsCell(row.item)
      : null;
  const diningPriceLevel =
    (row.blockType === "itinerary-dining" || row.blockType === "data-dining") &&
    price
      ? price.length
      : null;
  const entryRef = useCallback(
    (el: HTMLLIElement | null) => registerEntry(row.id, el),
    [registerEntry, row.id],
  );

  // In editorial entries the "Ideal for" line reads as the closing sentence of the
  // blurb: it is appended into the same prose block so it inherits the exact
  // font, size and paragraph spacing rather than sitting apart as chips.
  const idealForProse =
    idealFor.length > 0
      ? `<p class="maps-listicle-ideal-for"><strong>Ideal for:</strong> ${idealFor
          .map(escapeHtml)
          .join(", ")}</p>`
      : "";
  const editorialBlurbHtml =
    blurb || idealForProse ? `${blurb ?? ""}${idealForProse}` : null;

  return (
    <li
      ref={entryRef}
      className="scroll-mt-4 border-t-[3px] border-double border-foreground/55 first:border-t-0 first:pt-0 pt-7 pb-7 last:pb-1 max-[379px]:pt-6 max-[379px]:pb-6 480:pt-9 480:pb-9 550:pt-11 550:pb-11 sm:pt-12 sm:pb-12 768:pt-14 768:pb-14"
    >
      <div className="min-w-0 space-y-3 380:space-y-3.5 480:space-y-4 sm:space-y-5">
        <ItineraryMomentBadge moment={moment} label={momentLabel} />

        <ListiclePhotoCarousel images={images} />

        <div className="space-y-2 480:space-y-2.5 sm:space-y-3">
          <ListicleVenueTitleRow
            title={row.item.title}
            priceLevel={diningPriceLevel}
            priceDescriptor={priceTierDescriptor(diningPriceLevel)}
          />
        </div>

        {editorialBlurbHtml ? (
          <div
            className="article-prose maps-listicle-blurb maps-listicle-venue-blurb max-w-none pb-1"
            dangerouslySetInnerHTML={{ __html: editorialBlurbHtml }}
          />
        ) : null}

        <ListicleTourPicks tours={row.tours} />

        <ListicleVenueInfoGrid
          item={row.item}
          extraCells={nightlifeDetailsCell ? [nightlifeDetailsCell] : []}
          variant="list"
          actionVariant="editorial"
        />

        {instagramCode ? (
          <div className="-mx-1 flex w-full min-w-0 justify-center pt-1 480:pt-2 sm:pt-3">
            {/* First entries render eagerly; the rest pre-load in the
                background a couple at a time (InstagramEmbedBlock warm-up
                queue) so they're ready before the reader reaches them. */}
            <InstagramEmbedBlock
              embedCode={instagramCode}
              captionMode="hide"
              eager={index < 2}
              className="w-full max-w-[540px]"
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}
