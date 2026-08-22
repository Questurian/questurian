"use client";

import type { JSX, ReactNode } from "react";
import { Clock, ExternalLink, MapPin, Route } from "lucide-react";
import { ShimmerImage } from "@/components/media/ShimmerImage";
import { ArticlePageHeader } from "@/features/articles/components/ArticlePageHeader";
import { InstagramEmbedBlock } from "@/features/articles/components/InstagramEmbedBlock";
import { ItineraryStayCard } from "@/features/articles/components/ItineraryStayCard";
import { ItineraryMomentBadge } from "@/features/articles/components/ItineraryMomentBadge";
import { ListicleMapRegion } from "@/features/articles/components/ListicleMapRegion";
import { ListicleSeparator } from "@/features/articles/components/ListicleSeparator";
import { ListicleVenueEntry } from "@/features/articles/components/ListicleVenueEntry";
import {
  isTourAgencyBlock,
  populatedVenueStops,
  venueRowFromBlock,
} from "@/features/articles/lib/itineraryDays";
import {
  formatPriceTier,
  isHttpUrl,
} from "@/features/articles/lib/listicleVenueFormatters";
import type {
  ItineraryDay,
  ItineraryStopBlock,
  ItineraryTourAgencyBlock,
  ItineraryTourAgencyKeyLocation,
  ListicleItineraryArticle,
} from "@/features/articles/types/itineraryListicle";
import { isListicleVenue } from "@/features/articles/types/mapsListicle";

type ItineraryListicleArticlePageProps = {
  article: ListicleItineraryArticle;
  days: ItineraryDay[];
  selectedDayIndex: number;
  onSelectDay: (index: number) => void;
  /**
   * Rendered where the day-by-day plan would be when this itinerary is gated
   * and the reader has not paid for it. Null once a member's full body loads.
   */
  lockedSlot?: ReactNode;
};

function formatDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) {
    return "Tour";
  }
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

function normalizedHref(url: string): string {
  const trimmed = url.trim();
  return isHttpUrl(trimmed) ? trimmed : `https://${trimmed}`;
}

function keyLocationLabel(row: ItineraryTourAgencyKeyLocation): string | null {
  if (row.source === "manual") {
    return typeof row.title === "string" && row.title.trim()
      ? row.title.trim()
      : null;
  }

  const value = row.relatedItem?.value;
  return isListicleVenue(value) ? value.title : null;
}

function TourAgencyCard({
  block,
}: {
  block: ItineraryTourAgencyBlock;
}): JSX.Element {
  const image =
    typeof block.image === "object" && block.image !== null
      ? block.image
      : null;
  const imageUrl = typeof image?.url === "string" ? image.url : null;
  const instagramCode =
    typeof block.instagramPost === "object" && block.instagramPost !== null
      ? block.instagramPost.embedCode
      : null;
  const startingPoint =
    typeof block.startingPoint?.label === "string" &&
    block.startingPoint.label.trim()
      ? block.startingPoint.label.trim()
      : null;
  const keyLocations = (block.keyLocations ?? [])
    .map(keyLocationLabel)
    .filter((label): label is string => Boolean(label));
  const href = block.url ? normalizedHref(block.url) : null;
  // Tiers are stored as '1'-'4'; the ticks are rendered, never persisted.
  const price = formatPriceTier(block.price);

  return (
    <li className="scroll-mt-4 border-t-[3px] border-double border-foreground/55 first:border-t-0 first:pt-0 pt-7 pb-7 last:pb-1 max-[379px]:pt-6 max-[379px]:pb-6 480:pt-9 480:pb-9 550:pt-11 550:pb-11 sm:pt-12 sm:pb-12 768:pt-14 768:pb-14">
      <div className="min-w-0 space-y-3 380:space-y-3.5 480:space-y-4 sm:space-y-5">
        <ItineraryMomentBadge moment={block.moment} label={block.momentLabel} />

        {imageUrl ? (
          <div className="overflow-hidden rounded-sm bg-foreground/[0.04]">
            <div className="aspect-[16/10] w-full 380:aspect-[4/3] 480:aspect-[3/2] sm:aspect-[16/9]">
              <ShimmerImage
                src={imageUrl}
                alt={image?.alt_text ?? block.title}
                width={1200}
                height={750}
                sizes="(min-width: 768px) 700px, 100vw"
                className="h-full w-full object-cover"
                wrapperClassName="h-full w-full"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        ) : null}

        <div className="space-y-2 480:space-y-2.5 sm:space-y-3">
          <h2 className="font-display text-[1.15rem] font-semibold leading-[1.2] text-foreground 380:text-[1.35rem] 480:text-[1.5rem] 550:text-[1.55rem] sm:text-[1.7rem] 768:text-[1.8rem]">
            {block.title}
          </h2>

          <p className="maps-listicle-meta-row">
            <span className="maps-listicle-meta-item">
              <span className="maps-listicle-meta-value">{block.operator}</span>
            </span>
            {price ? (
              <span className="maps-listicle-meta-item">
                <span className="maps-listicle-meta-separator" aria-hidden />
                <span className="maps-listicle-meta-value">{price}</span>
              </span>
            ) : null}
          </p>
        </div>

        <div className="overflow-hidden rounded-sm border border-foreground/12 bg-foreground/[0.07] sm:rounded">
          <div className="grid grid-cols-1 gap-px bg-foreground/12 480:grid-cols-2">
            <div className="maps-listicle-utility-cell flex items-center gap-2.5 px-3 py-2.5 380:px-3.5 480:gap-3 480:px-4 480:py-3 sm:px-4 sm:py-3.5 768:px-5 768:py-3.5">
              <Clock
                className="maps-listicle-info-icon text-[var(--maps-listicle-accent)] shrink-0 size-[15px] 480:size-[16px] sm:size-[17px]"
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="maps-listicle-info-label break-words text-[12px] font-light leading-tight text-foreground/72 480:text-[13px] sm:text-[14px]">
                {formatDuration(block.tourDuration)}
              </span>
            </div>

            {startingPoint ? (
              <div className="maps-listicle-utility-cell flex items-center gap-2.5 px-3 py-2.5 380:px-3.5 480:gap-3 480:px-4 480:py-3 sm:px-4 sm:py-3.5 768:px-5 768:py-3.5">
                <MapPin
                  className="maps-listicle-info-icon text-[var(--maps-listicle-accent)] shrink-0 size-[15px] 480:size-[16px] sm:size-[17px]"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span className="maps-listicle-info-label break-words text-[12px] font-light leading-tight text-foreground/72 480:text-[13px] sm:text-[14px]">
                  {startingPoint}
                </span>
              </div>
            ) : null}

            {href ? (
              <div className="maps-listicle-utility-cell flex items-center gap-2.5 px-3 py-2.5 380:px-3.5 480:col-span-2 480:gap-3 480:px-4 480:py-3 sm:px-4 sm:py-3.5 768:px-5 768:py-3.5">
                <ExternalLink
                  className="maps-listicle-info-icon text-[var(--maps-listicle-accent)] shrink-0 size-[15px] 480:size-[16px] sm:size-[17px]"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="maps-listicle-info-label break-words text-[12px] font-light leading-tight text-foreground/72 hover:text-foreground focus-visible:text-foreground focus-visible:outline-none 480:text-[13px] sm:text-[14px]"
                >
                  Book tour
                </a>
              </div>
            ) : null}
          </div>
        </div>

        {keyLocations.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase leading-none tracking-[0.16em] text-foreground/45">
              <Route className="size-[14px]" strokeWidth={1.8} aria-hidden />
              Route
            </div>
            <div className="flex flex-wrap gap-1.5 380:gap-2">
              {keyLocations.map((label) => (
                <span
                  key={label}
                  className="inline-flex min-h-7 max-w-full min-w-0 items-center justify-center px-2.5 text-center text-[9px] font-semibold leading-none text-foreground/80 rounded-none bg-[var(--maps-listicle-chip)] [overflow-wrap:anywhere] 380:min-h-8 380:px-3 380:text-[10px] 480:px-3.5 480:text-[11px]"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {block.blurb ? (
          <div
            className="article-prose maps-listicle-blurb maps-listicle-venue-blurb max-w-none pb-1"
            dangerouslySetInnerHTML={{ __html: block.blurb }}
          />
        ) : null}

        {instagramCode ? (
          <div className="-mx-1 flex w-full min-w-0 justify-center pt-1 480:pt-2 sm:pt-3">
            <InstagramEmbedBlock
              embedCode={instagramCode}
              captionMode="hide"
              className="w-full max-w-[540px]"
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}

function StopList({
  stops,
}: {
  stops: ItineraryStopBlock[];
}): JSX.Element | null {
  if (stops.length === 0) return null;

  return (
    <ol className="m-0 list-none p-0">
      {stops.map((block, index) => {
        if (isTourAgencyBlock(block)) {
          return (
            <TourAgencyCard
              key={block.id ?? `${block.blockType}-${index}`}
              block={block}
            />
          );
        }

        const row = venueRowFromBlock(block, `${block.blockType}-${index}`);
        if (!row) return null;

        return (
          <ListicleVenueEntry
            key={row.id}
            row={row}
            index={index}
            moment={block.moment}
            momentLabel={block.momentLabel}
          />
        );
      })}
    </ol>
  );
}

export function ItineraryListicleArticlePage({
  article,
  days,
  selectedDayIndex,
  onSelectDay,
  lockedSlot,
}: ItineraryListicleArticlePageProps): JSX.Element {
  const dayIndex = Math.min(selectedDayIndex, Math.max(days.length - 1, 0));
  const selectedDay = days[dayIndex] ?? { whereStaying: [], items: [] };
  const whereStaying = populatedVenueStops(selectedDay.whereStaying);
  const stops = selectedDay.items ?? [];
  const featuredImage = article.header?.featuredImage;
  const introRaw = article.header?.intro;
  const introHtml = typeof introRaw === "string" ? introRaw : null;
  const description = article.seoSection?.metaDescription;

  return (
    <article className="maps-listicle-article min-h-screen bg-background sm:max-w-[600px] sm:mx-auto 1024:max-w-none 1024:mx-0">
      <ArticlePageHeader
        title={article.title}
        description={description}
        featuredImage={
          featuredImage?.url
            ? { url: featuredImage.url, alt: featuredImage.alt_text }
            : null
        }
        publishedAt={article.publishedAt ?? undefined}
        updatedAt={article.updatedAt}
        author={article.author}
        bookmark={{ targetType: "itineraries", targetId: article.id }}
      />

      {introHtml ? (
        <div className="px-3 pt-6 pb-2 380:px-4 380:pt-8 380:pb-3 480:px-5 480:pt-10 480:pb-4 550:px-6 sm:px-8 sm:pt-10 sm:pb-5 768:px-10">
          <div
            className="article-prose maps-listicle-intro max-w-none"
            dangerouslySetInnerHTML={{ __html: introHtml }}
          />
        </div>
      ) : null}

      <ListicleSeparator />

      {days.length > 1 ? (
        <div
          data-listicle-sticky-chrome=""
          className="sticky top-[var(--navbar-height,0px)] z-10 bg-background px-3 380:px-4 480:px-5 550:px-6 sm:px-8 768:px-10"
        >
          <div
            role="tablist"
            aria-label="Itinerary days"
            className="day-tabs-scroll flex gap-5 overflow-x-auto border-b border-foreground/15 480:gap-7"
          >
            {days.map((day, index) => {
              const selected = index === dayIndex;

              return (
                <button
                  key={day.id ?? `day-${index}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`shrink-0 -mb-px border-b-2 px-0.5 pt-4 pb-3 text-[11px] font-bold uppercase leading-none tracking-[0.16em] transition-colors 480:text-[12px] ${
                    selected
                      ? "border-[var(--maps-listicle-accent)] text-foreground"
                      : "border-transparent text-foreground/45 hover:text-foreground"
                  }`}
                  onClick={() => onSelectDay(index)}
                >
                  Day {index + 1}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="px-3 pb-20 pt-6 380:px-4 380:pt-7 480:px-5 480:pt-8 480:pb-24 550:px-6 550:pt-10 sm:px-8 sm:pt-8 sm:pb-32 768:px-10">
        <ListicleMapRegion>
          {whereStaying.length > 0 ? (
            <div className="mb-7 space-y-8 border-b-[3px] border-double border-foreground/55 pb-7 max-[379px]:mb-6 max-[379px]:pb-6 480:mb-9 480:space-y-10 480:pb-9 550:mb-11 550:pb-11 sm:mb-12 sm:space-y-12 sm:pb-12 768:mb-14 768:pb-14">
              {whereStaying.map((row) => (
                <ItineraryStayCard key={row.id} row={row} />
              ))}
            </div>
          ) : null}

          <StopList stops={stops} />
        </ListicleMapRegion>

        {lockedSlot}
      </div>
    </article>
  );
}
