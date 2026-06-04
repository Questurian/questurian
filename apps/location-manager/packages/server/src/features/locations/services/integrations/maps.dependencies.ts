import * as mapsFactory from "../geocoding/maps-location.factory";
import * as mapsUrl from "../geocoding/google/maps-url.utils";
import * as coreRepository from "../../repositories/core";
import * as contentRepository from "../../repositories/content";

export const createFromMaps = (...args: Parameters<typeof mapsFactory.createFromMaps>) =>
  mapsFactory.createFromMaps(...args);

export const generateGoogleMapsUrl = (...args: Parameters<typeof mapsUrl.generateGoogleMapsUrl>) =>
  mapsUrl.generateGoogleMapsUrl(...args);

export const findPotentialDuplicateLocations = (
  ...args: Parameters<typeof coreRepository.findPotentialDuplicateLocations>
) => coreRepository.findPotentialDuplicateLocations(...args);

export const getAttractionTours = (...args: Parameters<typeof coreRepository.getAttractionTours>) =>
  coreRepository.getAttractionTours(...args);

export const getLocationByIdForUpdate = (
  ...args: Parameters<typeof coreRepository.getLocationByIdForUpdate>
) => coreRepository.getLocationByIdForUpdate(...args);

export const saveLocationOrThrow = (
  ...args: Parameters<typeof coreRepository.saveLocationOrThrow>
) => coreRepository.saveLocationOrThrow(...args);

export const setAttractionTours = (...args: Parameters<typeof coreRepository.setAttractionTours>) =>
  coreRepository.setAttractionTours(...args);

export const updateLocationById = (...args: Parameters<typeof coreRepository.updateLocationById>) =>
  coreRepository.updateLocationById(...args);

export const getInstagramEmbedsByLocationId = (
  ...args: Parameters<typeof contentRepository.getInstagramEmbedsByLocationId>
) => contentRepository.getInstagramEmbedsByLocationId(...args);

export const getUploadsByLocationId = (
  ...args: Parameters<typeof contentRepository.getUploadsByLocationId>
) => contentRepository.getUploadsByLocationId(...args);
