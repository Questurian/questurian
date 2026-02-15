/**
 * Checklist Service
 * Generates pipeline status checklists for the UI
 */

import type { Location } from "../../models/location";
import type {
  PayloadSyncChecklist,
  ReviewsChecklist,
  JsonExportChecklist,
  CombinedPipelineStatus,
} from "./types/checklist.types";
import * as PayloadSyncRepo from "../../repositories/integration";
import { LocationQueryService } from "../core/location-query.service";

export class ChecklistService {
  constructor(private readonly locationQuery: LocationQueryService) {}

  /**
   * Generate Payload Sync checklist for a location
   */
  getPayloadSyncChecklist(locationId: number): PayloadSyncChecklist {
    const location = this.locationQuery.getLocationById(locationId);
    if (!location) {
      throw new Error(`Location ${locationId} not found`);
    }

    const syncState = PayloadSyncRepo.getSyncState(
      locationId,
      this.getCollectionForLocation(location)
    );

    // Determine target collection from location type
    const collectionMap: Record<string, 'dining' | 'accommodations' | 'attractions' | 'nightlife'> = {
      restaurant: 'dining',
      'fast-food': 'dining',
      'food-truck': 'dining',
      cafe: 'dining',
      bar: 'dining',
      pub: 'dining',
      'rooftop-bar': 'dining',
      'street-food': 'dining',
      brewery: 'dining',
      winery: 'dining',
      hotel: 'accommodations',
      hostel: 'accommodations',
      'guest-house': 'accommodations',
      museum: 'attractions',
      monument: 'attractions',
      park: 'attractions',
      nightclub: 'nightlife',
      'lounge': 'nightlife',
    };

    const targetCollection = collectionMap[location.type] || 'dining';

    // Build checklist items
    const checklistItems = [
      {
        category: 'BASIC INFORMATION',
        fields: [
          {
            name: 'Title',
            fieldPath: 'title',
            value: location.title,
            required: true,
            status: location.title ? 'complete' : 'missing',
            recommended: false,
          },
          {
            name: 'Type',
            fieldPath: 'type',
            value: location.type,
            required: true,
            status: location.type ? 'complete' : 'missing',
            recommended: false,
          },
          {
            name: 'Price Level',
            fieldPath: 'priceLevel',
            value: location.priceLevel || null,
            required: false,
            status: location.priceLevel ? 'complete' : 'missing',
            recommended: true,
            note: 'Shown as $ symbols in Payload',
          },
        ],
      },
      {
        category: 'VISUALS',
        fields: [
          {
            name: 'Gallery Images',
            fieldPath: 'gallery',
            value: location.gallery || [],
            valueCount: location.gallery?.length || 0,
            required: true,
            minRequired: 1,
            status:
              location.gallery && location.gallery.length > 0
                ? 'complete'
                : 'missing',
            recommended: false,
          },
          {
            name: 'Instagram Gallery',
            fieldPath: 'instagramGallery',
            value: location.instagramGallery || [],
            valueCount: location.instagramGallery?.length || 0,
            required: false,
            status:
              location.instagramGallery && location.instagramGallery.length > 0
                ? 'complete'
                : 'missing',
            recommended: false,
          },
        ],
      },
      {
        category: 'CLASSIFICATION',
        fields: [
          {
            name: 'Cuisines',
            fieldPath: 'cuisines',
            value: location.cuisines || [],
            required: false,
            status: location.cuisines && location.cuisines.length > 0 ? 'complete' : 'missing',
            recommended: targetCollection === 'dining',
          },
          {
            name: 'Ideal For Tags',
            fieldPath: 'idealFor',
            value: location.idealFor || [],
            required: false,
            status: location.idealFor && location.idealFor.length > 0 ? 'complete' : 'missing',
            recommended: true,
          },
        ],
      },
      {
        category: 'LOCATION & CONTACT',
        fields: [
          {
            name: 'Location Hierarchy',
            fieldPath: 'location_hierarchy',
            value: {
              country: location.country,
              city: location.city,
              neighborhood: location.neighborhood,
            },
            required: true,
            status:
              location.country && location.city ? 'complete' : 'missing',
            recommended: false,
          },
          {
            name: 'Address',
            fieldPath: 'address',
            value: location.address,
            required: true,
            status: location.address ? 'complete' : 'missing',
            recommended: false,
          },
          {
            name: 'Coordinates',
            fieldPath: 'coordinates',
            value: {
              latitude: location.latitude,
              longitude: location.longitude,
            },
            required: true,
            status:
              location.latitude && location.longitude ? 'complete' : 'missing',
            recommended: false,
          },
          {
            name: 'Phone Number',
            fieldPath: 'phoneNumber',
            value: location.phoneNumber,
            required: false,
            status: location.phoneNumber ? 'complete' : 'missing',
            recommended: false,
          },
          {
            name: 'Website',
            fieldPath: 'website',
            value: location.website,
            required: false,
            status: location.website ? 'complete' : 'missing',
            recommended: false,
          },
          {
            name: 'Email',
            fieldPath: 'email',
            value: location.email,
            required: false,
            status: location.email ? 'complete' : 'missing',
            recommended: false,
          },
          {
            name: 'Hours of Operation',
            fieldPath: 'operationHours',
            value: location.operationHours || {},
            required: false,
            status: location.operationHours ? 'complete' : 'missing',
            recommended: true,
          },
          {
            name: 'Timezone',
            fieldPath: 'ianaTimeId',
            value: location.ianaTimeId,
            required: false,
            status: location.ianaTimeId ? 'complete' : 'missing',
            recommended: true,
          },
        ],
      },
      {
        category: 'PAYLOAD INTEGRATION',
        fields: [
          {
            name: 'Location Ref',
            fieldPath: 'payload_location_ref',
            value: location.payload_location_ref,
            required: true,
            status: location.payload_location_ref ? 'complete' : 'missing',
            note: 'Auto-resolved from location hierarchy',
          },
        ],
      },
    ];

    // Calculate completion
    let totalItems = 0;
    let completeItems = 0;
    const missingRequired: string[] = [];
    const missingRecommended: string[] = [];

    checklistItems.forEach((category) => {
      category.fields.forEach((field) => {
        totalItems++;
        if (field.status === 'complete') {
          completeItems++;
        } else {
          if (field.required) {
            missingRequired.push(field.name);
          } else if (field.recommended) {
            missingRecommended.push(field.name);
          }
        }
      });
    });

    const completionPercent = Math.round((completeItems / totalItems) * 100);
    const canSync = missingRequired.length === 0;

    return {
      completionPercent,
      lastSyncedAt: syncState?.last_sync_at || null,
      syncStatus: (syncState?.status as any) || 'ready',
      targetCollection,
      errorMessage: syncState?.error_message || undefined,

      items: checklistItems,

      summary: {
        totalItems,
        completeItems,
        missingRequired,
        missingRecommended,
        warnings: missingRecommended.length > 0 ?
          [`${missingRecommended.length} recommended fields not filled`] : [],
      },

      canSync,
      actions: {
        sync: canSync,
        viewInPayload: !!location.payload_doc_id,
        testConnection: true,
      },
    };
  }

  /**
   * Generate Reviews Pipeline checklist for a location
   * Note: This returns basic structure. Real implementation would check actual fetch status
   */
  getReviewsChecklist(locationId: number): ReviewsChecklist {
    const location = this.locationQuery.getLocationById(locationId);
    if (!location) {
      throw new Error(`Location ${locationId} not found`);
    }

    // TODO: Integrate with actual reviews fetch status tracking
    // For now, return template structure
    return {
      completionPercent: 0,
      fetchPhase: {
        status: 'not_started',
        steps: [
          {
            name: 'Google Reviews',
            status: 'not_started',
            icon: '❌',
            details: {},
            actions: { reFetch: true, viewRaw: false },
          },
          {
            name: 'TripAdvisor Reviews',
            status: 'not_started',
            icon: '❌',
            details: {},
            actions: { pause: false, cancel: false, viewProgress: false },
          },
          {
            name: 'TripAdvisor Place Data',
            status: 'not_started',
            icon: '❌',
            details: {},
            actions: { viewPlacePage: false },
          },
        ],
      },
      mergePhase: {
        status: 'not_started',
        icon: '❌',
        message: 'No reviews fetched yet',
        prerequisites: {
          googleReviewsComplete: false,
          tripAdvisorReviewsComplete: false,
          tripAdvisorPlaceComplete: false,
        },
        actions: { startMerge: false, preview: false },
      },
      summary: {
        totalFetched: 0,
        sources: {
          google: { count: 0, ready: false },
          tripadvisor_reviews: { count: 0, progress: 0, ready: false },
          tripadvisor_place: { rating: 0, ready: false },
        },
      },
      timeline: [
        {
          step: 1,
          name: 'Fetch Google Reviews',
          status: 'waiting',
        },
        {
          step: 2,
          name: 'Fetch TripAdvisor Reviews',
          status: 'waiting',
          blocker: 'Waiting for step 1',
        },
        {
          step: 3,
          name: 'Fetch TripAdvisor Place',
          status: 'waiting',
          blocker: 'Waiting for step 1',
        },
        {
          step: 4,
          name: 'Translate & Merge',
          status: 'waiting',
          blocker: 'Waiting for steps 2-3',
        },
      ],
    };
  }

  /**
   * Generate JSON Export checklist for a location
   */
  getJsonExportChecklist(locationId: number): JsonExportChecklist {
    const location = this.locationQuery.getLocationById(locationId);
    if (!location) {
      throw new Error(`Location ${locationId} not found`);
    }

    // Calculate schema coverage
    const locationExportSections = this.buildLocationExportSchema(location);
    const aiJsonExportSections = this.buildAiJsonExportSchema(location);

    const locationExportPercent = this.calculateCompletionPercent(
      locationExportSections
    );
    const aiJsonExportPercent = this.calculateCompletionPercent(
      aiJsonExportSections
    );

    return {
      locationExport: {
        completionPercent: locationExportPercent,
        canExport: true,
        fileSize: '45 KB',
        sections: locationExportSections,
        actions: {
          download: true,
          preview: true,
        },
      },
      aiJsonExport: {
        completionPercent: aiJsonExportPercent,
        canExport: true,
        fileSize: '150 KB',
        qualityScore: this.calculateQualityScore(location),
        sections: aiJsonExportSections,
        actions: {
          download: true,
          preview: true,
        },
      },
      comparison: {
        fieldsOnlyInLocationExport: [],
        fieldsOnlyInAiJson: [
          'merged_reviews',
          'quality_metrics',
          'google_reviews',
        ],
        fieldsInBoth: [
          'metadata',
          'location',
          'contact',
          'media',
          'classification',
          'tripadvisor',
        ],
      },
    };
  }

  /**
   * Get combined status for all three pipelines
   */
  getCombinedPipelineStatus(
    locationId: number
  ): CombinedPipelineStatus {
    return {
      payload_sync: this.getPayloadSyncChecklist(locationId),
      reviews: this.getReviewsChecklist(locationId),
      json_export: this.getJsonExportChecklist(locationId),
    };
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  private getCollectionForLocation(location: Location): string {
    const collectionMap: Record<string, string> = {
      restaurant: 'dining',
      'fast-food': 'dining',
      hotel: 'accommodations',
      museum: 'attractions',
      nightclub: 'nightlife',
    };
    return collectionMap[location.type] || 'dining';
  }

  private buildLocationExportSchema(location: Location) {
    return [
      {
        name: 'METADATA',
        completionPercent: 100,
        fields: [
          {
            name: 'id',
            type: 'number' as const,
            value: location.id,
            included: true,
            required: true,
            status: 'complete' as const,
          },
          {
            name: 'title',
            type: 'string' as const,
            value: location.title,
            included: true,
            required: true,
            status: location.title ? 'complete' : 'missing',
          },
          {
            name: 'export_timestamp',
            type: 'date' as const,
            included: true,
            required: true,
            status: 'complete' as const,
          },
        ],
      },
      {
        name: 'LOCATION INFORMATION',
        completionPercent: location.country && location.city ? 100 : 50,
        fields: [
          {
            name: 'type',
            type: 'string' as const,
            value: location.type,
            included: true,
            required: true,
            status: location.type ? 'complete' : 'missing',
          },
          {
            name: 'hierarchy.country',
            type: 'string' as const,
            value: location.country,
            included: true,
            required: true,
            status: location.country ? 'complete' : 'missing',
          },
          {
            name: 'hierarchy.city',
            type: 'string' as const,
            value: location.city,
            included: true,
            required: true,
            status: location.city ? 'complete' : 'missing',
          },
          {
            name: 'coordinates.latitude',
            type: 'number' as const,
            value: location.latitude,
            included: true,
            required: true,
            status: location.latitude ? 'complete' : 'missing',
          },
          {
            name: 'coordinates.longitude',
            type: 'number' as const,
            value: location.longitude,
            included: true,
            required: true,
            status: location.longitude ? 'complete' : 'missing',
          },
        ],
      },
      {
        name: 'CONTACT INFORMATION',
        completionPercent: location.address ? 80 : 40,
        fields: [
          {
            name: 'address',
            type: 'string' as const,
            value: location.address,
            included: true,
            required: true,
            status: location.address ? 'complete' : 'missing',
          },
          {
            name: 'phone',
            type: 'string' as const,
            value: location.phoneNumber,
            included: true,
            required: false,
            status: location.phoneNumber ? 'complete' : 'missing',
          },
          {
            name: 'website',
            type: 'string' as const,
            value: location.website,
            included: true,
            required: false,
            status: location.website ? 'complete' : 'missing',
          },
        ],
      },
      {
        name: 'MEDIA',
        completionPercent:
          location.gallery && location.gallery.length > 0 ? 100 : 0,
        fields: [
          {
            name: 'gallery',
            type: 'array' as const,
            valueCount: location.gallery?.length || 0,
            included: true,
            required: true,
            status:
              location.gallery && location.gallery.length > 0
                ? 'complete'
                : 'missing',
          },
        ],
      },
      {
        name: 'ENRICHMENT',
        completionPercent: 0,
        fields: [
          {
            name: 'tripadvisor.rating',
            type: 'number' as const,
            included: false,
            required: false,
            status: 'missing',
            source: 'tripadvisor',
          },
        ],
      },
    ];
  }

  private buildAiJsonExportSchema(location: Location) {
    // Similar to buildLocationExportSchema but with more fields
    return this.buildLocationExportSchema(location);
  }

  private calculateCompletionPercent(sections: any[]): number {
    if (sections.length === 0) return 0;
    const totalPercent = sections.reduce((sum, s) => sum + s.completionPercent, 0);
    return Math.round(totalPercent / sections.length);
  }

  private calculateQualityScore(location: Location): number {
    let score = 0;
    const maxScore = 10;

    if (location.title) score += 1;
    if (location.type) score += 1;
    if (location.address) score += 1;
    if (location.latitude && location.longitude) score += 1;
    if (location.gallery && location.gallery.length > 0) score += 1;
    if (location.website) score += 1;
    if (location.phoneNumber) score += 1;
    if (location.email) score += 1;
    if (location.operationHours) score += 1;
    if (location.cuisines && location.cuisines.length > 0) score += 1;

    return score / maxScore;
  }
}
