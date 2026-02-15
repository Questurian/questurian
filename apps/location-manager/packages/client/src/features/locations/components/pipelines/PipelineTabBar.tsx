/**
 * Pipeline TabBar Component
 * Displays three tabs for Payload Sync, Reviews, and JSON Export checklists
 */

import { useState } from 'react';
import type {
  PayloadSyncChecklist,
  ReviewsChecklist,
  JsonExportChecklist,
} from '@shared/types/location';
import { PayloadSyncChecklist as PayloadSyncChecklistComponent } from './PayloadSyncChecklist';
import { ReviewsChecklist as ReviewsChecklistComponent } from './ReviewsChecklist';
import { JsonExportChecklist as JsonExportChecklistComponent } from './JsonExportChecklist';

export type TabType = 'payload' | 'reviews' | 'json';

interface PipelineTabBarProps {
  locationId: number | null;
  payloadSync: PayloadSyncChecklist | null;
  reviews: ReviewsChecklist | null;
  jsonExport: JsonExportChecklist | null;
  isLoading: boolean;
  onSync?: () => void;
  onFetchReviews?: () => void;
  onMergeReviews?: () => void;
  onDownloadLocation?: () => void;
  onDownloadAiJson?: () => void;
}

const TABS = [
  { id: 'payload', label: 'Payload Sync', icon: '⚡' },
  { id: 'reviews', label: 'Reviews', icon: '📝' },
  { id: 'json', label: 'JSON Export', icon: '📦' },
] as const;

export function PipelineTabBar({
  locationId,
  payloadSync,
  reviews,
  jsonExport,
  isLoading,
  onSync,
  onFetchReviews,
  onMergeReviews,
  onDownloadLocation,
  onDownloadAiJson,
}: PipelineTabBarProps) {
  const [activeTab, setActiveTab] = useState<TabType>('payload');

  if (!locationId) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`px-4 py-3 font-semibold border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'text-gray-900 border-gray-900'
                : 'text-gray-600 border-transparent hover:text-gray-900'
            }`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'payload' && (
          <PayloadSyncChecklistComponent
            checklist={payloadSync}
            isLoading={isLoading}
            onSync={onSync}
          />
        )}

        {activeTab === 'reviews' && (
          <ReviewsChecklistComponent
            checklist={reviews}
            isLoading={isLoading}
            onFetch={onFetchReviews}
            onMerge={onMergeReviews}
          />
        )}

        {activeTab === 'json' && (
          <JsonExportChecklistComponent
            checklist={jsonExport}
            isLoading={isLoading}
            onDownloadLocation={onDownloadLocation}
            onDownloadAiJson={onDownloadAiJson}
          />
        )}
      </div>
    </div>
  );
}
