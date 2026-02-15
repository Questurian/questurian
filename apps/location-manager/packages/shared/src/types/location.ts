/**
 * Location Checklist Types for Pipeline Status UI
 * Shared between server and client
 */

// ============================================================================
// PAYLOAD SYNC CHECKLIST
// ============================================================================

export interface ChecklistField {
  name: string;
  fieldPath: string;
  value: any;
  required: boolean;
  status: 'complete' | 'missing' | 'invalid';
  recommended?: boolean;
  note?: string;
  minRequired?: number;
  valueCount?: number;
}

export interface ChecklistCategory {
  category: string;
  fields: ChecklistField[];
}

export interface PayloadSyncChecklist {
  completionPercent: number;
  lastSyncedAt: string | null;
  syncStatus: 'ready' | 'pending' | 'syncing' | 'success' | 'error';
  targetCollection: 'dining' | 'accommodations' | 'attractions' | 'nightlife';
  errorMessage?: string;

  items: ChecklistCategory[];

  summary: {
    totalItems: number;
    completeItems: number;
    missingRequired: string[];
    missingRecommended: string[];
    warnings: string[];
  };

  canSync: boolean;
  actions: {
    sync: boolean;
    viewInPayload: boolean;
    testConnection: boolean;
  };
}

// ============================================================================
// REVIEWS PIPELINE CHECKLIST
// ============================================================================

export type ReviewsSourceStatus = 'not_started' | 'fetching' | 'complete' | 'error';
export type ReviewsMergeStatus = 'not_started' | 'ready_to_start' | 'merging' | 'complete' | 'error';
export type PipelineStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ReviewsSourceStep {
  name: 'Google Reviews' | 'TripAdvisor Reviews' | 'TripAdvisor Place Data';
  status: ReviewsSourceStatus;
  icon: string;
  details: {
    reviewCount?: number;
    avgRating?: number;
    languages?: Record<string, number>;
    fetchedAt?: string;
    progress?: number;
    targetCount?: number;
    rating?: number;
    photoCount?: number;
    estimatedTime?: string;
    error?: string;
  };
  actions: Record<string, boolean>;
}

export interface ReviewsMergePhase {
  status: ReviewsMergeStatus;
  message?: string;
  icon: string;
  prerequisites?: {
    googleReviewsComplete: boolean;
    tripAdvisorReviewsComplete: boolean;
    tripAdvisorPlaceComplete: boolean;
  };
  estimatedStats?: {
    totalReviewsAfterFetch: number;
    estimatedAfterDedup: number;
    estimatedAccepted: number;
  };
  stats?: {
    totalFetched: number;
    afterDeduplication: number;
    accepted: number;
    rejected: number;
    qualityThreshold: number;
    completionTime: string;
  };
  languages?: Record<string, number>;
  topKeywords?: Array<{
    keyword: string;
    mentions: number;
    sentiment: 'positive' | 'negative' | 'neutral';
  }>;
  actions: Record<string, boolean>;
}

export interface ReviewsPipelineStep {
  step: number;
  name: string;
  status: 'complete' | 'in_progress' | 'waiting' | 'queued';
  duration?: string;
  progress?: number;
  blocker?: string;
}

export interface ReviewsChecklist {
  completionPercent: number;

  fetchPhase: {
    status: ReviewsSourceStatus;
    steps: ReviewsSourceStep[];
  };

  mergePhase: ReviewsMergePhase;

  summary: {
    totalFetched: number;
    sources: {
      google: {
        count: number;
        ready: boolean;
      };
      tripadvisor_reviews: {
        count: number;
        progress: number;
        ready: boolean;
      };
      tripadvisor_place: {
        rating: number;
        ready: boolean;
      };
    };
  };

  timeline: ReviewsPipelineStep[];
}

// ============================================================================
// JSON EXPORT CHECKLIST
// ============================================================================

export type ExportFieldType = 'string' | 'number' | 'date' | 'object' | 'array' | 'boolean';

export interface ExportField {
  name: string;
  type: ExportFieldType;
  value?: any;
  valueCount?: number;
  included: boolean;
  required: boolean;
  status: 'complete' | 'missing' | 'partial';
  source?: 'location' | 'google_reviews' | 'tripadvisor' | 'merged_reviews';
}

export interface ExportSection {
  name: string;
  completionPercent: number;
  fields: ExportField[];
}

export interface SingleExportChecklist {
  completionPercent: number;
  canExport: boolean;
  fileSize: string;
  sections: ExportSection[];
  actions: {
    download: boolean;
    preview: boolean;
  };
}

export interface JsonExportChecklist {
  locationExport: SingleExportChecklist;
  aiJsonExport: SingleExportChecklist & {
    qualityScore: number;
  };
  comparison: {
    fieldsOnlyInLocationExport: string[];
    fieldsOnlyInAiJson: string[];
    fieldsInBoth: string[];
  };
}

// ============================================================================
// COMBINED PIPELINE STATUS
// ============================================================================

export interface CombinedPipelineStatus {
  payload_sync: PayloadSyncChecklist;
  reviews: ReviewsChecklist;
  json_export: JsonExportChecklist;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ChecklistResponse<T> {
  data: T;
  timestamp: string;
  locationId: number;
}
