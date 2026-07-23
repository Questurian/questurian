import type { ArticleAuthor, SeoSection } from "@/features/articles/types";
import type {
  ListicleInstagramPost,
  ListicleSelectedPhoto,
  ListicleTourPick,
  ListicleVenue,
  MapsListicleHeader,
} from "./mapsListicle";

export type ItineraryMoment =
  | "breakfast"
  | "coffee"
  | "lunch"
  | "sweet-treat"
  | "culture"
  | "landmark"
  | "shopping"
  | "outdoor"
  | "sunset"
  | "dinner"
  | "drinks"
  | "nightlife";

export type ItineraryVenueBlockType =
  | "itinerary-where-staying"
  | "itinerary-dining"
  | "itinerary-accommodations"
  | "itinerary-attractions"
  | "itinerary-nightlife"
  | "itinerary-key-location";

export type ItineraryStopVenueBlockType = Exclude<
  ItineraryVenueBlockType,
  "itinerary-where-staying"
>;

export type ItineraryVenueBlock = {
  id?: string | null;
  blockName?: string | null;
  blockType: ItineraryVenueBlockType;
  item: ListicleVenue;
  moment?: ItineraryMoment | null;
  momentLabel?: string | null;
  blurb?: string;
  mediaMode?: "photos" | "instagram" | "both";
  selectedPhotos?: ListicleSelectedPhoto[] | null;
  selectedInstagramPost?: ListicleInstagramPost | number | string | null;
  /** Operator-curated Tour Picks on attraction stops (ordered, max 4). */
  tours?: ListicleTourPick[] | null;
};

export type ItineraryTourAgencyKeyLocation = {
  id?: string | null;
  source: "existing" | "manual";
  title?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  relatedItem?: {
    relationTo:
      | "dining"
      | "accommodations"
      | "attractions"
      | "nightlife"
      | "key-locations";
    value: number | ListicleVenue;
  } | null;
};

export type ItineraryTourAgencyBlock = {
  id?: string | null;
  blockName?: string | null;
  blockType: "itinerary-tour-agency";
  moment?: ItineraryMoment | null;
  momentLabel?: string | null;
  title: string;
  operator: string;
  price?: "$" | "$$" | "$$$" | "$$$$" | null;
  url: string;
  tourDuration: number;
  startingPoint?: {
    label?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
  keyLocations?: ItineraryTourAgencyKeyLocation[] | null;
  image?:
    | {
        url?: string | null;
        alt_text?: string | null;
      }
    | number
    | null;
  instagramPost?: ListicleInstagramPost | number | string | null;
  blurb?: string;
};

export type ItineraryStopBlock =
  | (ItineraryVenueBlock & { blockType: ItineraryStopVenueBlockType })
  | ItineraryTourAgencyBlock;

export type ItineraryDay = {
  id?: string | null;
  whereStaying?: ItineraryVenueBlock[] | null;
  items?: ItineraryStopBlock[] | null;
};

export type ListicleItineraryArticle = {
  id: number;
  title: string;
  slug: string;
  articleType: "listicle-itinerary";
  publishedAt?: string | null;
  updatedAt?: string;
  author?: ArticleAuthor | null;
  header?: MapsListicleHeader | null;
  dayCount?: number | null;
  itineraryDays?: ItineraryDay[] | null;
  whereStaying?: ItineraryVenueBlock[] | null;
  items?: ItineraryStopBlock[] | null;
  seoSection?: SeoSection;
};

export function isListicleItineraryArticle(
  doc: unknown,
): doc is ListicleItineraryArticle {
  return (
    typeof doc === "object" &&
    doc !== null &&
    "articleType" in doc &&
    (doc as ListicleItineraryArticle).articleType === "listicle-itinerary"
  );
}
