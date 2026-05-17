export const LOCATION_SELECT_COLUMNS = `
  e.id,
  e.name,
  e.title,
  e.address,
  e.url,
  e.lat,
  e.lng,
  e.category,
  COALESCE(d.type, n.type, a.type, at.type, kl.type) as type,
  e.locationKey,
  e.district,
  e.contactAddress,
  e.countryCode,
  e.iana_time_id as ianaTimeId,
  e.phoneNumber,
  e.website,
  e.email,
  COALESCE(d.hours_json, n.hours_json, a.hours_json, at.hours_json, kl.hours_json) as hoursJson,
  e.neighborhood_description as neighborhoodDescription,
  COALESCE(d.ideal_for_json, n.ideal_for_json, a.ideal_for_json, at.ideal_for_json, kl.ideal_for_json) as idealForJson,
  COALESCE(d.nightlife_details_json, n.nightlife_details_json, a.nightlife_details_json, at.nightlife_details_json, kl.nightlife_details_json) as nightlifeDetailsJson,
  COALESCE(d.accommodations_details_json, n.accommodations_details_json, a.accommodations_details_json, at.accommodations_details_json, kl.accommodations_details_json) as accommodationsDetailsJson,
  COALESCE(d.attractions_details_json, n.attractions_details_json, a.attractions_details_json, at.attractions_details_json, kl.attractions_details_json) as attractionsDetailsJson,
  COALESCE(d.key_locations_details_json, n.key_locations_details_json, a.key_locations_details_json, at.key_locations_details_json, kl.key_locations_details_json) as keyLocationsDetailsJson,
  COALESCE(d.tripadvisor_meal_types, n.tripadvisor_meal_types, a.tripadvisor_meal_types, at.tripadvisor_meal_types, kl.tripadvisor_meal_types) as tripadvisorMealTypesJson,
  COALESCE(d.tripadvisor_cuisines, n.tripadvisor_cuisines, a.tripadvisor_cuisines, at.tripadvisor_cuisines, kl.tripadvisor_cuisines) as tripadvisorCuisinesJson,
  COALESCE(d.tripadvisor_features, n.tripadvisor_features, a.tripadvisor_features, at.tripadvisor_features, kl.tripadvisor_features) as tripadvisorFeaturesJson,
  COALESCE(d.menu_url, n.menu_url, a.menu_url, at.menu_url, kl.menu_url) as menuUrl,
  COALESCE(d.reservation_url, n.reservation_url, a.reservation_url, at.reservation_url, kl.reservation_url) as reservationUrl,
  COALESCE(d.price_level, n.price_level, a.price_level, at.price_level, kl.price_level) as priceLevel,
  e.slug,
  e.place_id as placeId,
  e.tripadvisor_url as tripadvisorUrl,
  e.tripadvisor_location_id as tripadvisorLocationId,
  e.payload_location_ref,
  e.selected_payload_media_set_ids_json as selectedPayloadMediaSetIdsJson,
  e.provenance as provenanceJson,
  e.pending_suggestions as pendingSuggestionsJson,
  e.reviews_fetched_at as reviewsFetchedAt,
  e.reviews_count as reviewsCount,
  e.reviews_google_count as reviewsGoogleCount,
  e.reviews_tripadvisor_count as reviewsTripadvisorCount,
  e.reviews_enabled as reviewsEnabled,
  e.created_at,
  e.updated_at
`;

export const LOCATION_FROM_AND_JOINS = `
  FROM entities e
  LEFT JOIN dining_locations d ON d.entity_id = e.id
  LEFT JOIN nightlife_locations n ON n.entity_id = e.id
  LEFT JOIN accommodations_locations a ON a.entity_id = e.id
  LEFT JOIN attractions_locations at ON at.entity_id = e.id
  LEFT JOIN key_locations_locations kl ON kl.entity_id = e.id
`;

export const LOCATION_SELECT = `
  SELECT
    ${LOCATION_SELECT_COLUMNS}
  ${LOCATION_FROM_AND_JOINS}
`;
