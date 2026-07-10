import { ServiceContainer } from "../container/service-container";

const container = ServiceContainer.getInstance();

export function getLocationsControllerDeps() {
  return {
    locationQuery: container.core.query,
    locationMutation: container.core.mutation,
  };
}

export function getMapsControllerDeps() {
  return {
    maps: container.core.maps,
    uploads: container.content.uploads,
    locationMutation: container.core.mutation,
  };
}

export function getInstagramControllerDeps() {
  return {
    instagram: container.content.instagram,
  };
}

export function getUploadsControllerDeps() {
  return {
    uploads: container.content.uploads,
  };
}

export function getPhotoImportControllerDeps() {
  return {
    photoImport: container.content.photoImport,
    instagram: container.content.instagram,
  };
}

export function getNeighborhoodDescriptionControllerDeps() {
  return {
    locationQuery: container.core.query,
    altTextApi: container.clients.altTextApi,
  };
}

export function getPayloadControllerDeps() {
  return {
    payloadApi: container.clients.payloadApi,
    payloadSync: container.integration.payloadSync,
  };
}

export function getToursControllerDeps() {
  return {
    payloadApi: container.clients.payloadApi,
  };
}

export function getTaxonomyControllerDeps() {
  return {
    taxonomy: container.admin.taxonomy,
  };
}

export function getTaxonomyCorrectionControllerDeps() {
  return {
    taxonomyCorrection: container.admin.taxonomyCorrection,
  };
}

export function getAdminControllerDeps() {
  return {
    imageStorage: container.admin.imageStorage,
  };
}

export function getFieldSuggestionsControllerDeps() {
  return {
    accommodationsField: container.suggestions.accommodationsField,
    diningField: container.suggestions.diningField,
  };
}

export function getPendingSuggestionsControllerDeps() {
  return {
    accommodationsField: container.suggestions.accommodationsField,
    diningField: container.suggestions.diningField,
    pending: container.suggestions.pending,
  };
}
