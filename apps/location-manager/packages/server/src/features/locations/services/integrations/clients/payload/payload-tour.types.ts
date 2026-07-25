import type { PayloadRelationshipId } from "./payload-shared.types";

export interface PayloadTourData {
  title: string;
  img: PayloadRelationshipId;
  bookingLink: string;
  price: string;
  locationRef?: PayloadRelationshipId;
  status: "draft" | "published";
}

export interface PayloadTourResponse {
  message?: string;
  doc: {
    id: string;
    title: string;
    img?: unknown;
    bookingLink: string;
    price: string;
    locationRef?: unknown;
    status: "draft" | "published";
    createdAt?: string;
    updatedAt?: string;
  };
}
