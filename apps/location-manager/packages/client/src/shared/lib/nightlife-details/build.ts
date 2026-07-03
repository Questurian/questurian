import type { BuildNightlifeDetailsInput, NightlifeDetailsPayload } from "./types";

export function buildNightlifeDetails(
  input: BuildNightlifeDetailsInput
): NightlifeDetailsPayload {
  return {
    name: input.name,
    price_tier: input.priceTier,
    club_type: input.clubType,
    music: input.music,
    details: {
      theSpace: {
        venueType: { label: "Venue Type", value: input.venueType },
        venueSize: { label: "Venue Size", value: input.venueSize },
        spaceLayout: { label: "Layout", value: input.spaceLayout },
        vibe: { label: "Vibe", value: input.vibe },
        peakHours: { label: "Peak Hours", value: input.peakHours },
      },
      theScene: {
        musicFormat: { label: "Music", value: input.musicFormat },
        touristPresence: { label: "Tourist Presence", value: input.touristPresence },
        dressCode: { label: "Dress Code", value: input.dressCode },
        energyLevel: { label: "Energy Level", value: input.energyLevel },
        vipAndBottleService: {
          label: "VIP & Bottle Service",
          value: input.vipAndBottleService,
        },
        crowdProfile: { label: "Age Range", value: input.crowdProfile },
      },
    },
    location: input.location,
    phone: input.phone,
    hours: input.hours,
    website: input.website,
    booking_url: input.bookingUrl,
    daytime_restaurant: Number(input.daytimeRestaurant),
  };
}
