/**
 * Taxonomy admin API
 */

import { apiGet, apiPatch, apiDelete, apiPost } from "./client";
import { API_ENDPOINTS } from "./config";
import type {
  PendingTaxonomyEntry,
  SuccessResponse,
  TaxonomyCorrection,
  TaxonomyCorrectionRequest,
  CorrectionPreview,
  CorrectionResult,
} from "./types";

/**
 * Unwrapped response types (after apiGet/apiPatch removes the outer wrapper)
 */
interface PendingTaxonomyData {
  entries: PendingTaxonomyEntry[];
}

interface TaxonomyEntryData {
  entry: {
    id: number;
    country: string;
    city: string | null;
    neighborhood: string | null;
    locationKey: string;
    status: 'pending' | 'approved';
    created_at: string;
  };
}

export const taxonomyAdminApi = {
  /**
   * Get all pending taxonomy entries
   */
  async getPendingEntries(): Promise<PendingTaxonomyEntry[]> {
    const response = await apiGet<PendingTaxonomyData>(
      API_ENDPOINTS.ADMIN_TAXONOMY_PENDING
    );
    return response.entries;
  },

  /**
   * Approve a pending taxonomy entry
   */
  async approveEntry(locationKey: string): Promise<TaxonomyEntryData["entry"]> {
    const response = await apiPatch<TaxonomyEntryData>(
      API_ENDPOINTS.ADMIN_TAXONOMY_APPROVE(locationKey),
      {}
    );
    return response.entry;
  },

  /**
   * Reject a pending taxonomy entry
   */
  async rejectEntry(locationKey: string): Promise<void> {
    await apiDelete<SuccessResponse>(
      API_ENDPOINTS.ADMIN_TAXONOMY_REJECT(locationKey)
    );
  },

  /**
   * Get all taxonomy correction rules
   */
  async getCorrections(): Promise<TaxonomyCorrection[]> {
    const response = await apiGet<{ corrections: TaxonomyCorrection[] }>(
      API_ENDPOINTS.ADMIN_TAXONOMY_CORRECTIONS
    );
    return response.corrections;
  },

  /**
   * Preview the impact of a taxonomy correction before creating it
   */
  async previewCorrection(data: TaxonomyCorrectionRequest): Promise<CorrectionPreview> {
    const response = await apiPost<{ preview: CorrectionPreview }>(
      API_ENDPOINTS.ADMIN_TAXONOMY_CORRECTIONS_PREVIEW,
      data
    );
    return response.preview;
  },

  /**
   * Create a new taxonomy correction rule and apply it retroactively
   */
  async createCorrection(data: TaxonomyCorrectionRequest): Promise<CorrectionResult> {
    const response = await apiPost<CorrectionResult>(
      API_ENDPOINTS.ADMIN_TAXONOMY_CORRECTIONS,
      data
    );
    return response;
  },

  /**
   * Delete a taxonomy correction rule
   */
  async deleteCorrection(id: number): Promise<void> {
    await apiDelete<SuccessResponse>(
      API_ENDPOINTS.ADMIN_TAXONOMY_CORRECTION_DELETE(id)
    );
  },
};
