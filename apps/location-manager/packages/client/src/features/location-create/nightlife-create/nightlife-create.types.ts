import type { AddNightlifeFormData } from "../validation/add-nightlife.schema";

export type NightlifeMultiField = "music" | "spaceLayout" | "vibe" | "musicFormat" | "dressCode";
export type NightlifeFormSection = "step1" | "entities" | "core" | "space" | "scene" | "contact";

export const NIGHTLIFE_SECTION_ORDER: NightlifeFormSection[] = [
  "step1",
  "entities",
  "core",
  "space",
  "scene",
  "contact",
];

export const NIGHTLIFE_FORM_DEFAULT_VALUES: AddNightlifeFormData = {
  name: "",
  idealFor: [],
  priceTier: "$$$",
  clubType: "Cocktail Bar",
  music: ["House", "EDM"],
  venueType: "Bar",
  venueSize: "Large",
  spaceLayout: ["Indoor", "Rooftop"],
  vibe: ["Upscale", "Exclusive", "High-Energy"],
  peakHours: "1:00 AM - 3:30 AM",
  touristPresence: "Low",
  musicFormat: ["Open Format"],
  dressCode: ["Upscale", "Dress to Impress"],
  energyLevel: "High",
  vipAndBottleService: "Yes",
  crowdProfile: "20-40",
  countryCode: "PE",
  location: "",
  phone: "",
  phoneNotAvailable: false,
  hours: "",
  tripadvisorUrl: "",
  website: "",
  bookingUrl: "",
  district: "",
  locationKey: "",
  ianaTimeId: "",
  placeId: "",
  googleUrl: "",
  latitude: "",
  longitude: "",
  daytimeRestaurant: "0",
};

export function normalizeNightlifeAddress(address: string) {
  return address.trim();
}

export function buildNightlifePrefillSignature(name: string, address: string) {
  return `${name.trim().toLowerCase()}|${normalizeNightlifeAddress(address).toLowerCase()}`;
}
