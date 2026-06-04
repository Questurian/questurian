import * as mapsFactory from "../geocoding/maps-location.factory";
import * as mapsUrl from "../geocoding/google/maps-url.utils";
import * as coreRepository from "../../repositories/core";
import * as contentRepository from "../../repositories/content";

export const createFromMaps = mapsFactory.createFromMaps;
export const generateGoogleMapsUrl = mapsUrl.generateGoogleMapsUrl;
export const findPotentialDuplicateLocations = coreRepository.findPotentialDuplicateLocations;
export const getAttractionTours = coreRepository.getAttractionTours;
export const getLocationByIdForUpdate = coreRepository.getLocationByIdForUpdate;
export const saveLocationOrThrow = coreRepository.saveLocationOrThrow;
export const setAttractionTours = coreRepository.setAttractionTours;
export const updateLocationById = coreRepository.updateLocationById;
export const getInstagramEmbedsByLocationId = contentRepository.getInstagramEmbedsByLocationId;
export const getUploadsByLocationId = contentRepository.getUploadsByLocationId;
