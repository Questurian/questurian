/**
 * Payload Sync Checklist Component
 * Shows completion status for syncing a location to Payload CMS
 */

import type { PayloadSyncChecklist as PayloadSyncChecklistType } from '@shared/types/location';
import { getStatusIcon, getCompletionBarColor, getReadinessLabel } from './utils';

interface PayloadSyncChecklistProps {
  checklist: PayloadSyncChecklistType | null;
  isLoading: boolean;
  onSync?: () => void;
}

export function PayloadSyncChecklist({
  checklist,
  isLoading,
  onSync,
}: PayloadSyncChecklistProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center text-gray-500">
          <div className="animate-spin mb-2">⏳</div>
          <p>Loading checklist...</p>
        </div>
      </div>
    );
  }

  if (!checklist) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No checklist data available</p>
      </div>
    );
  }

  const barColor = getCompletionBarColor(checklist.completionPercent);
  const readinessLabel = getReadinessLabel(checklist.canSync);

  return (
    <div className="space-y-6">
      {/* Header with status overview */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Payload Sync Status</h3>
            <span className="text-2xl">{getStatusIcon(checklist.syncStatus)}</span>
          </div>

          {/* Completion bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-600">Completion</span>
              <span className="text-sm font-semibold text-gray-900">{checklist.completionPercent}%</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${barColor} transition-all duration-300`}
                style={{ width: `${checklist.completionPercent}%` }}
              />
            </div>
          </div>

          {/* Status details */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-gray-600">Target Collection</p>
              <p className="font-semibold text-gray-900 capitalize">{checklist.targetCollection}</p>
            </div>
            {checklist.lastSyncedAt && (
              <div>
                <p className="text-gray-600">Last Synced</p>
                <p className="font-semibold text-gray-900">
                  {new Date(checklist.lastSyncedAt).toLocaleDateString()}
                </p>
              </div>
            )}
            <div>
              <p className="text-gray-600">Status</p>
              <p className="font-semibold text-gray-900">{readinessLabel}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Checklist items by category */}
      <div className="space-y-4">
        {checklist.items.map((category: typeof checklist.items[0], idx: number) => (
          <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
              <h4 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">
                {category.category}
              </h4>
            </div>
            <div className="divide-y divide-gray-200">
              {category.fields.map((field: typeof category.fields[0], fieldIdx: number) => (
                <div key={fieldIdx} className="px-4 py-3 flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getStatusIcon(field.status)}</span>
                      <div>
                        <p className="font-medium text-gray-900">{field.name}</p>
                        {field.note && <p className="text-xs text-gray-500">{field.note}</p>}
                        {field.required && (
                          <span className="inline-block mt-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                            Required
                          </span>
                        )}
                        {field.recommended && (
                          <span className="inline-block mt-1 ml-2 text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                            Recommended
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {field.value && (
                      <p className="text-sm text-gray-600 max-w-xs truncate">
                        {typeof field.value === 'object' ? JSON.stringify(field.value) : String(field.value)}
                      </p>
                    )}
                    {field.valueCount !== undefined && (
                      <p className="text-sm text-gray-600">{field.valueCount} items</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Summary section */}
      {checklist.summary.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h4 className="font-semibold text-amber-900 mb-2">Warnings</h4>
          <ul className="list-disc list-inside space-y-1">
            {checklist.summary.warnings.map((warning: string, idx: number) => (
              <li key={idx} className="text-amber-800 text-sm">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      {checklist.summary.missingRequired.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="font-semibold text-red-900 mb-2">Missing Required Fields</h4>
          <ul className="list-disc list-inside space-y-1">
            {checklist.summary.missingRequired.map((field: string, idx: number) => (
              <li key={idx} className="text-red-800 text-sm">
                {field}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 pt-4">
        <button
          disabled={!checklist.canSync || isLoading}
          onClick={onSync}
          className="flex-1 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          🔄 Sync Now
        </button>
        {checklist.actions.viewInPayload && (
          <button className="px-4 py-2 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors">
            View in Payload
          </button>
        )}
        <button className="px-4 py-2 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors">
          Test Connection
        </button>
      </div>
    </div>
  );
}
