/**
 * Reviews Pipeline Checklist Component
 * Shows progress of fetching and merging reviews from multiple sources
 */

import type { ReviewsChecklist as ReviewsChecklistType } from '@shared/types/location';
import { getStatusIcon, getCompletionBarColor } from './utils';

interface ReviewsChecklistProps {
  checklist: ReviewsChecklistType | null;
  isLoading: boolean;
  onFetch?: () => void;
  onMerge?: () => void;
}

export function ReviewsChecklist({
  checklist,
  isLoading,
  onFetch,
  onMerge,
}: ReviewsChecklistProps) {
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

  return (
    <div className="space-y-6">
      {/* Overall progress */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Reviews Pipeline Status</h3>
          <span className="text-2xl">{getStatusIcon(checklist.fetchPhase.status)}</span>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-600">Overall Progress</span>
            <span className="text-sm font-semibold text-gray-900">{checklist.completionPercent}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${barColor} transition-all duration-300`}
              style={{ width: `${checklist.completionPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Fetch Phase Steps */}
      <div className="space-y-3">
        <h4 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">
          Phase 1: Fetch Reviews
        </h4>

        {checklist.fetchPhase.steps.map((step: typeof checklist.fetchPhase.steps[0], idx: number) => (
          <div key={idx} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{step.icon}</span>
                <div>
                  <h5 className="font-semibold text-gray-900">{step.name}</h5>
                  <p className="text-xs text-gray-500 capitalize">{step.status.replace('_', ' ')}</p>
                </div>
              </div>
            </div>

            <div className="ml-10 space-y-2 text-sm">
              {step.details.reviewCount !== undefined && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Reviews Fetched:</span>
                  <span className="font-semibold text-gray-900">{step.details.reviewCount}</span>
                </div>
              )}

              {step.details.avgRating !== undefined && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Avg Rating:</span>
                  <span className="font-semibold text-gray-900">
                    ⭐ {step.details.avgRating.toFixed(1)}
                  </span>
                </div>
              )}

              {step.details.rating !== undefined && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Rating:</span>
                  <span className="font-semibold text-gray-900">
                    ⭐ {step.details.rating.toFixed(1)}
                  </span>
                </div>
              )}

              {step.details.progress !== undefined && (
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-600">Progress</span>
                    <span className="font-semibold text-gray-900">{step.details.progress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${step.details.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {step.details.languages && (
                <div>
                  <p className="text-gray-600 mb-1">Languages:</p>
                  <div className="space-y-1">
                    {Object.entries(step.details.languages).map(([lang, count]) => (
                      <div key={lang} className="flex justify-between ml-2">
                        <span className="text-gray-600">{lang.toUpperCase()}:</span>
                        <span className="font-semibold text-gray-900">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {step.details.fetchedAt && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Fetched:</span>
                  <span className="text-gray-900">{new Date(step.details.fetchedAt).toLocaleString()}</span>
                </div>
              )}

              {step.details.estimatedTime && (
                <div className="flex justify-between">
                  <span className="text-gray-600">ETA:</span>
                  <span className="font-semibold text-gray-900">{step.details.estimatedTime}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Merge Phase */}
      <div className="space-y-3">
        <h4 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">
          Phase 2: Translate & Merge
        </h4>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{getStatusIcon(checklist.mergePhase.status)}</span>
              <div>
                <h5 className="font-semibold text-gray-900">Merge & Translate Reviews</h5>
                <p className="text-xs text-gray-500">{checklist.mergePhase.message}</p>
              </div>
            </div>
          </div>

          {checklist.mergePhase.stats && (
            <div className="ml-10 space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-600">Total Fetched</p>
                  <p className="text-lg font-semibold text-gray-900">{checklist.mergePhase.stats.totalFetched}</p>
                </div>
                <div>
                  <p className="text-gray-600">After Deduplication</p>
                  <p className="text-lg font-semibold text-gray-900">{checklist.mergePhase.stats.afterDeduplication}</p>
                </div>
                <div>
                  <p className="text-gray-600">Accepted</p>
                  <p className="text-lg font-semibold text-green-600">{checklist.mergePhase.stats.accepted}</p>
                </div>
                <div>
                  <p className="text-gray-600">Rejected</p>
                  <p className="text-lg font-semibold text-red-600">{checklist.mergePhase.stats.rejected}</p>
                </div>
              </div>

              {checklist.mergePhase.topKeywords && checklist.mergePhase.topKeywords.length > 0 && (
                <div className="mt-4">
                  <p className="text-gray-600 font-semibold mb-2">Top Keywords</p>
                  <div className="space-y-1">
                    {checklist.mergePhase.topKeywords.map((kw: typeof checklist.mergePhase.topKeywords[0], idx: number) => (
                      <div key={idx} className="flex items-center justify-between">
                        <span className="text-gray-600">{kw.keyword}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">{kw.mentions} mentions</span>
                          <span className={`text-xs font-semibold ${
                            kw.sentiment === 'positive' ? 'text-green-600' :
                            kw.sentiment === 'negative' ? 'text-red-600' :
                            'text-gray-600'
                          }`}>
                            {kw.sentiment}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      {checklist.timeline && checklist.timeline.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">
            Pipeline Timeline
          </h4>
          <div className="space-y-2">
            {checklist.timeline.map((step: typeof checklist.timeline[0], idx: number) => (
              <div key={idx} className="flex items-center gap-3">
                <div className="min-w-fit">
                  <span className="text-2xl">{getStatusIcon(step.status)}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-900">Step {step.step}: {step.name}</p>
                    {step.duration && <span className="text-xs text-gray-500">{step.duration}</span>}
                  </div>
                  {step.blocker && (
                    <p className="text-xs text-gray-500">⚠️ {step.blocker}</p>
                  )}
                  {step.progress !== undefined && (
                    <div className="mt-1 w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${step.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 pt-4">
        <button
          disabled={isLoading || checklist.fetchPhase.status === 'fetching'}
          onClick={onFetch}
          className="flex-1 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          🔄 Fetch Reviews
        </button>
        <button
          disabled={isLoading || checklist.mergePhase.status === 'merging'}
          onClick={onMerge}
          className="flex-1 px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          ✨ Merge & Translate
        </button>
      </div>
    </div>
  );
}
