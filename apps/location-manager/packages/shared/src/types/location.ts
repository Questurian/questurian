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
// API RESPONSE TYPES
// ============================================================================

export interface ChecklistResponse<T> {
  data: T;
  timestamp: string;
  locationId: number;
}
